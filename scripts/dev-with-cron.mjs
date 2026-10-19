import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { experimental_readRawConfig, unstable_startWorker } from 'wrangler';
import {
  createLocalCronScheduler,
  toLocalCronExpression,
} from './local-cron.mjs';

export async function startLocalCronWorker({
  config = 'wrangler.jsonc',
  port = 8787,
  inspectorPort = 9230,
  persist,
  watch = true,
  logger = console,
} = {}) {
  const { rawConfig } = experimental_readRawConfig({ config });
  // developmentの配備用Cronは無効のまま、本番と共通のトップレベル設定をローカルで再現する。
  const expressions = rawConfig.triggers?.crons ?? [];
  expressions.forEach(toLocalCronExpression);
  const worker = await unstable_startWorker({
    config,
    env: 'development',
    dev: {
      remote: false,
      testScheduled: true,
      server: { hostname: '0.0.0.0', port },
      inspector: inspectorPort === false ? false : { port: inspectorPort },
      persist,
      watch,
    },
  });
  try {
    await worker.ready;
    const scheduler = createLocalCronScheduler(
      expressions,
      {
        async scheduled({ cron, scheduledTime }) {
          // 固定版Wranglerの公式Scheduledテスト入口を、起動したWorker自身へ送る。
          const query = new URLSearchParams({
            cron,
            time: String(scheduledTime),
          });
          const response = await worker.fetch(
            `http://localhost/__scheduled?${query}`
          );
          if (!response.ok)
            throw new Error(
              `Scheduled実行がHTTP ${response.status}で失敗しました`
            );
          return { outcome: 'ok' };
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
        await worker.dispose();
      },
    };
  } catch (error) {
    await worker.dispose();
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
  ) {
    throw new Error('ポートは1〜65535で指定してください');
  }
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
