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

// index.tsのscheduledハンドラは、通知配信Cron('* * * * *')と日次の
// 後片付けCron('0 18 * * *', #345)をevent.cronの値で区別する。AccountDeletionService.retryPendingPurges自体の詳細な挙動は
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
        authStateRepository: { deleteExpired: vi.fn() },
        refreshSessionRepository: { deleteExpired: vi.fn() },
      } as unknown as ReturnType<typeof container.createDIContainer>);

    const { ctx, waitUntilPromises } = buildExecutionContext();
    const event = {
      cron: '0 18 * * *',
      scheduledTime: Date.parse('2026-11-07T01:00:00Z'),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(event, { ...workerEnv, EVENT_DATE: '' }, ctx);
    await Promise.all(waitUntilPromises);

    expect(retryPendingPurges).toHaveBeenCalledWith(100);
    createDIContainerSpy.mockRestore();
  });

  it('日次Cronで期限切れのstateとRefresh Sessionを削除する', async () => {
    const container = await import('../src/di/container');
    const deleteExpiredStates = vi.fn().mockResolvedValue(undefined);
    const deleteExpiredSessions = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(container, 'createDIContainer').mockReturnValue({
      accountDeletionService: {
        retryPendingPurges: vi.fn().mockResolvedValue(undefined),
      },
      authStateRepository: { deleteExpired: deleteExpiredStates },
      refreshSessionRepository: { deleteExpired: deleteExpiredSessions },
    } as unknown as ReturnType<typeof container.createDIContainer>);

    const { ctx, waitUntilPromises } = buildExecutionContext();
    const event = {
      cron: '0 18 * * *',
      scheduledTime: Date.parse('2026-11-07T18:00:00Z'),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(event, workerEnv, ctx);
    await Promise.all(waitUntilPromises);

    expect(deleteExpiredStates).toHaveBeenCalledOnce();
    expect(deleteExpiredSessions).toHaveBeenCalledOnce();
  });

  it('EVENT_DATE未設定ではautomatic再同期をせずmanual v2だけResolverする', async () => {
    const container = await import('../src/di/container');
    const reconcileAll = vi.fn();
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
        notificationRetryService: {
          enqueueDueDeliveries: vi
            .fn()
            .mockResolvedValue({ claimed: 0, sent: 0, failed: 0 }),
        },
        notificationAudienceResolverService: { resolveDueSchedules },
        notificationDeliveryService: { enqueueReadySchedules },
        scheduledNotificationService: { enqueueDueNotifications },
      } as unknown as ReturnType<typeof container.createDIContainer>);

    const { ctx, waitUntilPromises } = buildExecutionContext();
    const event = {
      cron: '* * * * *',
      scheduledTime: Date.parse('2026-11-07T01:00:00Z'),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(event, { ...workerEnv, EVENT_DATE: '' }, ctx);
    await Promise.all(waitUntilPromises);

    expect(reconcileAll).not.toHaveBeenCalled();
    expect(resolveDueSchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime),
      { manualOnly: true }
    );
    expect(enqueueReadySchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime),
      { manualOnly: true }
    );
    expect(enqueueDueNotifications).not.toHaveBeenCalled();
    createDIContainerSpy.mockRestore();
  });

  it.each(['一部失敗', '例外'] as const)(
    '再同期の%sを記録し、Resolverと配信を続行する',
    async failure => {
      const container = await import('../src/di/container');
      const error = new Error('再同期の一時失敗');
      const reconcileAll =
        failure === '一部失敗'
          ? vi.fn().mockResolvedValue({
              processed_count: 1,
              failed_gathering_ids: [52],
            })
          : vi.fn().mockRejectedValue(error);
      const resolveDueSchedules = vi.fn().mockResolvedValue({
        completed_schedules: [],
        retryable_schedule_ids: [],
        failed_schedule_ids: [],
      });
      const enqueueReadySchedules = vi.fn().mockResolvedValue({
        queued_schedule_ids: [],
        completed_schedule_ids: [],
        failed_schedule_ids: [],
      });
      const enqueueDueNotifications = vi.fn();
      const createDIContainerSpy = vi
        .spyOn(container, 'createDIContainer')
        .mockReturnValue({
          notificationRetryService: {
            enqueueDueDeliveries: vi.fn().mockResolvedValue(0),
          },
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
        scheduledTime: Date.parse('2026-11-07T01:00:00Z'),
        noRetry: () => {},
      } as unknown as ScheduledEvent;

      await worker.scheduled(
        event,
        { ...workerEnv, EVENT_DATE: '2026-11-08' },
        ctx
      );
      await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();

      expect(resolveDueSchedules).toHaveBeenCalledTimes(1);
      expect(resolveDueSchedules).toHaveBeenCalledWith(
        new Date(event.scheduledTime)
      );
      expect(enqueueReadySchedules).toHaveBeenCalledTimes(1);
      expect(enqueueReadySchedules).toHaveBeenCalledWith(
        new Date(event.scheduledTime),
        { manualOnly: false }
      );
      expect(reconcileAll.mock.invocationCallOrder[0]).toBeLessThan(
        resolveDueSchedules.mock.invocationCallOrder[0]
      );
      expect(resolveDueSchedules.mock.invocationCallOrder[0]).toBeLessThan(
        enqueueReadySchedules.mock.invocationCallOrder[0]
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[CRON] Gathering自動通知の再同期に失敗しました',
        failure === '一部失敗' ? { gatheringIds: [52] } : error
      );
      createDIContainerSpy.mockRestore();
    }
  );

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
        notificationRetryService: {
          enqueueDueDeliveries: vi
            .fn()
            .mockResolvedValue({ claimed: 0, sent: 0, failed: 0 }),
        },
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
      scheduledTime: Date.parse('2026-11-07T01:00:00Z'),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(
      event,
      { ...workerEnv, EVENT_DATE: '2026-11-08' },
      ctx
    );
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
        notificationRetryService: {
          enqueueDueDeliveries: vi
            .fn()
            .mockResolvedValue({ claimed: 0, sent: 0, failed: 0 }),
        },
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
      scheduledTime: Date.parse('2026-11-07T01:00:00Z'),
      noRetry: () => {},
    } as unknown as ScheduledEvent;

    await worker.scheduled(
      event,
      { ...workerEnv, EVENT_DATE: '2026-11-08' },
      ctx
    );
    await expect(Promise.all(waitUntilPromises)).resolves.toBeDefined();

    expect(resolveDueSchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime)
    );
    expect(enqueueReadySchedules).toHaveBeenCalledWith(
      new Date(event.scheduledTime),
      { manualOnly: false }
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
