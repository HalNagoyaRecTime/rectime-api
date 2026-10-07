import { env as workerEnv } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
afterEach(() => vi.restoreAllMocks());

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

  it('通知cronは自動通知再同期が失敗した場合にAudience Resolverへ進まない', async () => {
    const container = await import('../src/di/container');
    const reconcileAll = vi
      .fn()
      .mockRejectedValue(
        new Error('EVENT_DATE must be configured for gathering reminders')
      );
    const resolveDueSchedules = vi.fn().mockResolvedValue({
      completed_schedules: [],
      retryable_schedule_ids: [],
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
        gatheringNotificationGeneratorService: { reconcileAll },
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

    expect(reconcileAll).toHaveBeenCalledTimes(1);
    expect(resolveDueSchedules).not.toHaveBeenCalled();
    expect(enqueueReadySchedules).not.toHaveBeenCalled();
    expect(enqueueDueNotifications).not.toHaveBeenCalled();
    createDIContainerSpy.mockRestore();
  });

  it('再同期に失敗したGatheringがあればその回のResolverを開始しない', async () => {
    const container = await import('../src/di/container');
    const reconcileAll = vi.fn().mockResolvedValue({
      processed_count: 1,
      failed_gathering_ids: [52],
    });
    const resolveDueSchedules = vi.fn();
    const enqueueReadySchedules = vi.fn();
    const enqueueDueNotifications = vi.fn();
    const createDIContainerSpy = vi
      .spyOn(container, 'createDIContainer')
      .mockReturnValue({
        gatheringNotificationGeneratorService: { reconcileAll },
        notificationAudienceResolverService: { resolveDueSchedules },
        notificationDeliveryService: { enqueueReadySchedules },
        scheduledNotificationService: { enqueueDueNotifications },
      } as unknown as ReturnType<typeof container.createDIContainer>);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { ctx, waitUntilPromises } = buildExecutionContext();
    const event = {
      cron: '* * * * *',
      scheduledTime: Date.now(),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(
      event,
      { ...workerEnv, EVENT_DATE: '2026-11-08' },
      ctx
    );
    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();

    expect(resolveDueSchedules).not.toHaveBeenCalled();
    expect(enqueueReadySchedules).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[CRON] Gathering自動通知の再同期に失敗しました',
      { gatheringIds: [52] }
    );
    createDIContainerSpy.mockRestore();
  });

  it('Audience Resolver自体のrejectをログへ記録し、Cron Promiseをrejectさせない', async () => {
    const container = await import('../src/di/container');
    const reconcileAll = vi.fn().mockResolvedValue({
      processed_count: 2,
      failed_gathering_ids: [],
    });
    const error = new Error('database unavailable');
    const resolveDueSchedules = vi.fn().mockRejectedValue(error);
    const enqueueDueNotifications = vi.fn();
    const enqueueReadySchedules = vi.fn();
    const createDIContainerSpy = vi
      .spyOn(container, 'createDIContainer')
      .mockReturnValue({
        gatheringNotificationGeneratorService: { reconcileAll },
        notificationAudienceResolverService: { resolveDueSchedules },
        notificationDeliveryService: { enqueueReadySchedules },
        scheduledNotificationService: { enqueueDueNotifications },
      } as unknown as ReturnType<typeof container.createDIContainer>);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { ctx, waitUntilPromises } = buildExecutionContext();
    const event = {
      cron: '* * * * *',
      scheduledTime: Date.now(),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(event, { ...workerEnv, EVENT_DATE: '' }, ctx);
    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();

    expect(reconcileAll).toHaveBeenCalledTimes(1);
    expect(vi.mocked(reconcileAll).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(resolveDueSchedules).mock.invocationCallOrder[0]
    );
    expect(resolveDueSchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[CRON] Notification Audience Resolver error',
      error
    );
    expect(enqueueDueNotifications).not.toHaveBeenCalled();
    expect(enqueueReadySchedules).not.toHaveBeenCalled();
    createDIContainerSpy.mockRestore();
  });

  it('Delivery準備のrejectはDelivery preparation errorとして記録する', async () => {
    const container = await import('../src/di/container');
    const reconcileAll = vi.fn().mockResolvedValue({
      processed_count: 2,
      failed_gathering_ids: [],
    });
    const error = new Error('database unavailable');
    const resolveDueSchedules = vi.fn().mockResolvedValue({
      completed_schedules: [],
      retryable_schedule_ids: [],
      failed_schedule_ids: [],
    });
    const enqueueReadySchedules = vi.fn().mockRejectedValue(error);
    const enqueueDueNotifications = vi.fn();
    const createDIContainerSpy = vi
      .spyOn(container, 'createDIContainer')
      .mockReturnValue({
        gatheringNotificationGeneratorService: { reconcileAll },
        notificationAudienceResolverService: { resolveDueSchedules },
        notificationDeliveryService: { enqueueReadySchedules },
        scheduledNotificationService: { enqueueDueNotifications },
      } as unknown as ReturnType<typeof container.createDIContainer>);
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    const { ctx, waitUntilPromises } = buildExecutionContext();
    const event = {
      cron: '* * * * *',
      scheduledTime: Date.now(),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(event, { ...workerEnv, EVENT_DATE: '' }, ctx);
    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();

    expect(resolveDueSchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime)
    );
    expect(enqueueReadySchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime)
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[CRON] Notification Delivery preparation error',
      error
    );
    expect(consoleErrorSpy).not.toHaveBeenCalledWith(
      '[CRON] Notification Audience Resolver error',
      error
    );
    expect(enqueueDueNotifications).not.toHaveBeenCalled();
    createDIContainerSpy.mockRestore();
  });
});
