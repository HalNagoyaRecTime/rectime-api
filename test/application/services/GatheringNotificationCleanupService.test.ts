import { describe, expect, it, vi } from 'vitest';
import { createGatheringNotificationCleanupService } from '../../../src/application/services/GatheringNotificationCleanupService';
import type { IGatheringNotificationCleanupRepository } from '../../../src/domain/interfaces/repositories/IGatheringNotificationCleanupRepository';
import type { INotificationStopService } from '../../../src/application/services/INotificationStopService';

function setup(
  schedules: Array<{
    notificationId: number;
    scheduleId: number;
    sendStatus: string;
    startedAt: string | null;
  }>
) {
  const repository: IGatheringNotificationCleanupRepository = {
    findAutomaticSchedulesByGatheringIds: vi.fn().mockResolvedValue(schedules),
    deleteUnstartedSchedule: vi.fn().mockResolvedValue(true),
    deleteNotificationIfNoSchedules: vi.fn().mockResolvedValue(true),
  };
  const notificationStopService: INotificationStopService = {
    stopSchedule: vi.fn().mockResolvedValue({
      status: 'stopped',
      notificationScheduleId: 101,
    }),
  };
  return {
    repository,
    notificationStopService,
    service: createGatheringNotificationCleanupService({
      repository,
      notificationStopService,
    }),
  };
}

describe('GatheringNotificationCleanupService', () => {
  it('未開始Scheduleを削除し、ScheduleがなくなったNotificationも削除する', async () => {
    const { repository, notificationStopService, service } = setup([
      {
        notificationId: 10,
        scheduleId: 101,
        sendStatus: 'scheduled',
        startedAt: null,
      },
    ]);

    await expect(
      service.cleanupForGatherings([51], new Date('2026-09-21T09:00:00.000Z'))
    ).resolves.toEqual({
      deletedScheduleCount: 1,
      stoppedScheduleCount: 0,
      preservedNotificationCount: 0,
    });
    expect(
      repository.findAutomaticSchedulesByGatheringIds
    ).toHaveBeenCalledWith([51]);
    expect(repository.deleteUnstartedSchedule).toHaveBeenCalledWith(101);
    expect(repository.deleteNotificationIfNoSchedules).toHaveBeenCalledWith(10);
    expect(notificationStopService.stopSchedule).not.toHaveBeenCalled();
  });

  it.each(['resolving', 'sending'])(
    '配信開始済みの%s Scheduleはsource_deleted Stopして履歴を保持する',
    async sendStatus => {
      const { repository, notificationStopService, service } = setup([
        {
          notificationId: 10,
          scheduleId: 101,
          sendStatus,
          startedAt: null,
        },
      ]);

      await expect(
        service.cleanupForGatherings([51], new Date('2026-09-21T09:00:00.000Z'))
      ).resolves.toEqual({
        deletedScheduleCount: 0,
        stoppedScheduleCount: 1,
        preservedNotificationCount: 0,
      });
      expect(notificationStopService.stopSchedule).toHaveBeenCalledWith(
        {
          scheduleId: 101,
          stoppedByUserId: null,
          reason: 'source_deleted',
        },
        new Date('2026-09-21T09:00:00.000Z')
      );
      expect(repository.deleteUnstartedSchedule).not.toHaveBeenCalled();
      expect(repository.deleteNotificationIfNoSchedules).toHaveBeenCalledWith(
        10
      );
    }
  );

  it('completed履歴はStopせず、Notificationを保持する', async () => {
    const { repository, notificationStopService, service } = setup([
      {
        notificationId: 10,
        scheduleId: 101,
        sendStatus: 'completed',
        startedAt: '2026-09-21T08:59:00.000Z',
      },
    ]);
    vi.mocked(repository.deleteNotificationIfNoSchedules).mockResolvedValue(
      false
    );

    await expect(service.cleanupForGatherings([51])).resolves.toEqual({
      deletedScheduleCount: 0,
      stoppedScheduleCount: 0,
      preservedNotificationCount: 1,
    });
    expect(notificationStopService.stopSchedule).not.toHaveBeenCalled();
    expect(repository.deleteUnstartedSchedule).not.toHaveBeenCalled();
  });

  it('未開始削除とWorker claimの競合時は共通Stopへフォールバックする', async () => {
    const { repository, notificationStopService, service } = setup([
      {
        notificationId: 10,
        scheduleId: 101,
        sendStatus: 'scheduled',
        startedAt: null,
      },
    ]);
    vi.mocked(repository.deleteUnstartedSchedule).mockResolvedValue(false);

    await expect(service.cleanupForGatherings([51])).resolves.toMatchObject({
      deletedScheduleCount: 0,
      stoppedScheduleCount: 1,
    });
    expect(notificationStopService.stopSchedule).toHaveBeenCalled();
  });
});
