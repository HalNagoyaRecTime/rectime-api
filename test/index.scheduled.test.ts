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
// 区別する。AccountDeletionService.retryPendingPurges自体の詳細な挙動は
// AccountDeletionService.test.tsで検証済み。
describe('scheduled handler', () => {
  it('account deletion retry cronはEVENT_DATE未設定でもpurgeを再実行する', async () => {
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

  it('通知cronはEVENT_DATE未設定でもAudience Resolverを起動する', async () => {
    const container = await import('../src/di/container');
    const resolveDueSchedules = vi.fn().mockResolvedValue({
      completed_schedules: [],
      failed_schedule_ids: [],
    });
    const enqueueDueNotifications = vi.fn();
    const enqueueReadySchedules = vi.fn().mockResolvedValue({
      queued_schedule_ids: [],
      completed_schedule_ids: [],
      failed_schedule_ids: [],
    });
    const createDIContainerSpy = vi
      .spyOn(container, 'createDIContainer')
      .mockReturnValue({
        notificationAudienceResolverService: { resolveDueSchedules },
        notificationDeliveryService: { enqueueReadySchedules },
        scheduledNotificationService: { enqueueDueNotifications },
      } as unknown as ReturnType<typeof container.createDIContainer>);

    const { ctx, waitUntilPromises } = buildExecutionContext();
    const event = {
      cron: '* * * * *',
      scheduledTime: Date.now(),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(event, { ...workerEnv, EVENT_DATE: '' }, ctx);
    await Promise.all(waitUntilPromises);

    expect(resolveDueSchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime)
    );
    expect(enqueueReadySchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime)
    );
    expect(enqueueDueNotifications).not.toHaveBeenCalled();
    createDIContainerSpy.mockRestore();
  });
});
