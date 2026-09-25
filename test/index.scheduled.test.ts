import { env as workerEnv } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import worker from '../src/index';

function buildExecutionContext(): {
  ctx: ExecutionContext;
  waitUntilPromises: Promise<unknown>[];
} {
  const waitUntilPromises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => {
      waitUntilPromises.push(promise);
    },
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  return { ctx, waitUntilPromises };
}

// index.tsのscheduledハンドラは、通知配信Cron('* * * * *')とアカウント
// 削除の後片付け再実行Cron('0 18 * * *', #345)をevent.cronの値で
// 区別する。ここではCron式の分岐が正しく行われることだけを確認する。
// AccountDeletionService.retryPendingPurges自体の詳細な挙動は
// AccountDeletionService.test.tsで検証済み。
describe('scheduled handler (#345 account deletion purge retry cron)', () => {
  it('event.cronが"0 18 * * *"の場合、EVENT_DATE未設定でもretryPendingPurgesが呼ばれる', async () => {
    const container = await import('../src/di/container');
    const retryPendingPurges = vi.fn().mockResolvedValue({
      targetCount: 0,
      succeededCount: 0,
      failedCount: 0,
    });
    const createDIContainerSpy = vi
      .spyOn(container, 'createDIContainer')
      .mockReturnValue({
        accountDeletionService: { retryPendingPurges },
      } as unknown as ReturnType<typeof container.createDIContainer>);

    const { ctx, waitUntilPromises } = buildExecutionContext();
    const event = {
      cron: '0 18 * * *',
      scheduledTime: Date.now(),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(event, { ...workerEnv, EVENT_DATE: '' }, ctx);
    await Promise.all(waitUntilPromises);

    expect(retryPendingPurges).toHaveBeenCalledWith(100);
    createDIContainerSpy.mockRestore();
  });

  it('event.cronが通知配信用("* * * * *")の場合、retryPendingPurgesは呼ばれない', async () => {
    const container = await import('../src/di/container');
    const createDIContainerSpy = vi.spyOn(container, 'createDIContainer');

    const { ctx } = buildExecutionContext();
    const event = {
      cron: '* * * * *',
      scheduledTime: Date.now(),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(event, { ...workerEnv, EVENT_DATE: '' }, ctx);

    // EVENT_DATE未設定のため、通知配信経路はDIコンテナすら作らずに
    // 早期リターンする(既存挙動)。アカウント削除の後片付け再実行経路にも
    // 入らないことを確認する。
    expect(createDIContainerSpy).not.toHaveBeenCalled();
    createDIContainerSpy.mockRestore();
  });
});
