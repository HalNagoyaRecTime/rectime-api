import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, URL } from 'node:url';
import { test } from 'node:test';
import {
  createLocalCronScheduler,
  toLocalCronExpression,
} from './local-cron.mjs';
import { parseJsonc, startLocalCronWorker } from './dev-with-cron.mjs';

const silent = { log() {}, error() {} };

test('JSONCのコメントと末尾カンマを処理し、文字列のURLは保持する', () => {
  assert.deepEqual(
    parseJsonc(
      '{ // コメント\n "url": "https://example.com/a", "crons": ["* * * * *",], }'
    ),
    { url: 'https://example.com/a', crons: ['* * * * *'] }
  );
});

test('UTCの毎分・日次CronとCloudflareの曜日番号を再現する', async () => {
  assert.equal(toLocalCronExpression('0 18 * * 1-7'), '0 18 * * 0-6');
  assert.equal(toLocalCronExpression('0 18 * * 1,7'), '0 18 * * 0,6');
  assert.equal(toLocalCronExpression('0 18 * * MON-FRI'), '0 18 * * MON-FRI');
  const scheduler = createLocalCronScheduler(
    ['* * * * *', '0 18 * * *'],
    { scheduled() {} },
    silent
  );
  const from = new Date('2026-10-12T17:59:30Z');
  for (const job of scheduler.jobs) {
    assert.equal(
      job.cronTime.getNextDateFrom(from, 'UTC').toUTC().toISO(),
      '2026-10-12T18:00:00.000Z'
    );
  }
  await scheduler.stop();
});

test('不正・非対応のCronを黙って実行しない', () => {
  assert.throws(() => toLocalCronExpression('* * * * * *'), /5項目/);
  assert.throws(() => toLocalCronExpression('0 0 * * 0'), /1〜7/);
  assert.throws(() => createLocalCronScheduler(['0 0 L * *'], {}, silent));
});

test('共通の複数Cronを重複登録せず、元の式と発火時刻をWorkerへ渡す', async () => {
  const calls = [];
  const scheduler = createLocalCronScheduler(
    ['* * * * *', '0 18 * * *', '* * * * *'],
    {
      async scheduled(event) {
        calls.push(event);
        return { outcome: 'ok' };
      },
    },
    silent
  );
  assert.equal(scheduler.jobs.length, 2);
  const before = Date.now();
  for (const job of scheduler.jobs) await job.fireOnTick();
  await scheduler.stop();
  assert.deepEqual(
    calls.map(call => call.cron),
    ['* * * * *', '0 18 * * *']
  );
  assert.ok(
    calls.every(
      call => call.scheduledTime >= before && call.scheduledTime <= Date.now()
    )
  );
});

test('重なる発火もWorkerへ渡し、停止時には実行完了を待つ', async () => {
  const resolvers = [];
  const scheduler = createLocalCronScheduler(
    ['* * * * *'],
    {
      scheduled() {
        return new Promise(resolve => resolvers.push(resolve));
      },
    },
    silent
  );
  await scheduler.jobs[0].fireOnTick();
  await scheduler.jobs[0].fireOnTick();
  assert.equal(resolvers.length, 2);
  let stopped = false;
  const completion = scheduler.stop().then(() => {
    stopped = true;
  });
  await delay(10);
  assert.equal(stopped, false);
  for (const resolve of resolvers) resolve({ outcome: 'ok' });
  await completion;
  assert.equal(stopped, true);
});

test('Worker実行失敗を記録し、次の発火を実行できる', async () => {
  const errors = [];
  let calls = 0;
  const scheduler = createLocalCronScheduler(
    ['* * * * *'],
    {
      async scheduled() {
        if (++calls === 1) throw new Error('一時的な失敗');
        return { outcome: 'ok' };
      },
    },
    {
      log() {},
      error(...args) {
        errors.push(args);
      },
    }
  );
  await scheduler.jobs[0].fireOnTick();
  await scheduler.stop();
  await scheduler.jobs[0].fireOnTick();
  await scheduler.stop();
  assert.equal(calls, 2);
  assert.equal(errors.length, 1);
});

test(
  'Wrangler CLI経由でScheduled→Queue→KVを実行する',
  { timeout: 60_000 },
  async () => {
    const runtime = await startLocalCronWorker({
      config: fileURLToPath(
        new URL('./fixtures/local-cron/wrangler.jsonc', import.meta.url)
      ),
      port: 0,
      inspectorPort: false,
      persist: false,
      logger: silent,
    });
    try {
      // 毎分の壁時計待ちを避け、Schedulerから実WorkerのScheduled入口へ送る。
      await runtime.scheduler.jobs[0].fireOnTick();
      const deadline = Date.now() + 15_000;
      let result;
      do {
        result = await (await runtime.worker.fetch('http://localhost/')).json();
        if (result.queue) break;
        await delay(150);
      } while (Date.now() < deadline);
      assert.equal(result.scheduled?.cron, '* * * * *');
      assert.equal(result.queue?.cron, '* * * * *');
      assert.ok(Number.isFinite(result.scheduled.scheduledTime));
      await runtime.scheduler.jobs[1].fireOnTick();
      await runtime.scheduler.stop();
      result = await (await runtime.worker.fetch('http://localhost/')).json();
      assert.equal(result.scheduled.cron, '0 18 * * *');
    } finally {
      await runtime.dispose();
    }
  }
);
