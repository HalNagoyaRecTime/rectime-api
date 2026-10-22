import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import {
  createLocalCronScheduler,
  toLocalCronExpression,
} from './local-cron.mjs';

const HOST = '127.0.0.1';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const WRANGLER_CLI = resolve(ROOT, 'node_modules/wrangler/bin/wrangler.js');

// コメントと末尾のカンマを除去する。文字列中のURLやスラッシュは保持する。
export function parseJsonc(source) {
  const withoutComments = source.replace(
    /"(?:\\.|[^"\\])*"|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,
    match => (match.startsWith('"') ? match : '')
  );
  return JSON.parse(
    withoutComments.replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (match, tail) =>
      match.startsWith('"') ? match : tail
    )
  );
}

async function availablePort() {
  const server = createServer();
  server.listen(0, HOST);
  await once(server, 'listening');
  const port = server.address().port;
  server.close();
  await once(server, 'close');
  return port;
}

async function awaitReady(port, child, getOutput) {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Wranglerが起動前に終了しました: ${getOutput()}`);
    try {
      const response = await fetch(
        `http://${HOST}:${port}/__local_cron_health_check__`,
        { signal: AbortSignal.timeout(1000) }
      );
      await response.body?.cancel();
      return;
    } catch {
      await delay(200);
    }
  }
  throw new Error(`Wranglerの起動がタイムアウトしました: ${getOutput()}`);
}

export async function startLocalCronWorker({
  config = 'wrangler.jsonc',
  port = 8787,
  inspectorPort = 9230,
  persist,
  logger = console,
} = {}) {
  const configPath = resolve(config);
  const rawConfig = parseJsonc(await readFile(configPath, 'utf8'));
  // developmentではCronをデプロイしないが、ローカル検証ではトップレベルの式を用いる。
  const expressions = rawConfig.triggers?.crons ?? [];
  if (!Array.isArray(expressions))
    throw new Error('triggers.cronsは配列で指定してください');
  expressions.forEach(toLocalCronExpression);

  const actualPort = port === 0 ? await availablePort() : port;
  const temporaryState =
    persist === false
      ? await mkdtemp(join(tmpdir(), 'rectime-local-cron-'))
      : null;
  const args = [
    WRANGLER_CLI,
    'dev',
    '--config',
    configPath,
    '--env',
    'development',
    '--local',
    '--test-scheduled',
    '--ip',
    HOST,
    '--port',
    String(actualPort),
  ];
  if (inspectorPort !== false)
    args.push('--inspector-port', String(inspectorPort));
  if (temporaryState) args.push('--persist-to', temporaryState);
  else if (persist) args.push('--persist-to', resolve(persist));

  // 非安定のJavaScript APIを使わず、Wrangler CLIの公式Scheduled入口を利用する。
  const child = spawn(process.execPath, args, {
    cwd: ROOT,
    stdio: ['inherit', 'pipe', 'pipe'],
    env: process.env,
  });
  let output = '';
  let childError = null;
  child.on('error', error => {
    childError = error;
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', data => {
      output = (output + data.toString()).slice(-6000);
      if (logger === console) process.stdout.write(data);
    });
  }
  const stopChild = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const closed = once(child, 'close');
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 10_000);
    try {
      await closed;
    } finally {
      clearTimeout(timeout);
    }
  };
  try {
    await awaitReady(actualPort, child, () => String(childError ?? output));
    const base = `http://${HOST}:${actualPort}`;
    const worker = {
      fetch(input, init) {
        const url = new URL(input, 'http://localhost');
        return fetch(base + url.pathname + url.search, init);
      },
    };
    const scheduler = createLocalCronScheduler(
      expressions,
      {
        async scheduled({ cron, scheduledTime }) {
          const query = new URLSearchParams({
            cron,
            time: String(scheduledTime),
            format: 'json',
          });
          const response = await worker.fetch(
            `http://localhost/__scheduled?${query}`
          );
          if (!response.ok)
            throw new Error(
              `Scheduled実行がHTTP ${response.status}で失敗しました`
            );
          const contentType = response.headers.get('content-type') ?? '';
          const result = contentType.includes('json')
            ? await response.json()
            : null;
          return { outcome: result?.outcome ?? 'ok' };
        },
      },
      logger
    );
    scheduler.start();
    logger.log(
      `[LOCAL_CRON] UTCのCronを開始しました: ${expressions.join(', ') || '設定なし'}`
    );
    return {
      worker,
      scheduler,
      async dispose() {
        await scheduler.stop();
        await stopChild();
        if (temporaryState)
          await rm(temporaryState, { recursive: true, force: true });
      },
    };
  } catch (error) {
    await stopChild();
    if (temporaryState)
      await rm(temporaryState, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      config: { type: 'string', default: 'wrangler.jsonc' },
      port: { type: 'string', default: '8787' },
      'inspector-port': { type: 'string', default: '9230' },
    },
  });
  const port = Number(values.port);
  const inspectorPort = Number(values['inspector-port']);
  if (
    ![port, inspectorPort].every(
      value => Number.isInteger(value) && value > 0 && value <= 65535
    )
  )
    throw new Error('ポートは1〜65535で指定してください');
  let runtime;
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await runtime?.dispose();
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  try {
    runtime = await startLocalCronWorker({
      config: values.config,
      port,
      inspectorPort,
    });
    if (stopping) await runtime.dispose();
  } catch (error) {
    await stop();
    console.error(error);
    process.exitCode = 1;
  }
}
