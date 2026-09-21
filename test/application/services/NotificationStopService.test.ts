import { describe, expect, it, vi } from 'vitest';
import { createNotificationStopService } from '../../../src/application/services/NotificationStopService';
import type { INotificationStopRepository } from '../../../src/domain/interfaces/repositories/INotificationStopRepository';

function setup() {
  const repository: INotificationStopRepository = {
    stopSchedule: vi.fn().mockResolvedValue('stopped'),
  };
  return {
    repository,
    service: createNotificationStopService({ repository }),
  };
}

describe('NotificationStopService', () => {
  it('manual StopをRepositoryへ渡し、stopped結果を返す', async () => {
    const { repository, service } = setup();

    await expect(
      service.stopSchedule(
        {
          scheduleId: 496,
          stoppedByUserId: 12,
          reason: 'manual',
        },
        new Date('2026-09-21T09:00:00.000Z')
      )
    ).resolves.toEqual({
      notificationScheduleId: 496,
      status: 'stopped',
    });
    expect(repository.stopSchedule).toHaveBeenCalledWith(
      496,
      12,
      'manual',
      '2026-09-21T09:00:00.000Z'
    );
  });

  it('source_deletedでは操作Userなしで同じStop処理を利用できる', async () => {
    const { repository, service } = setup();

    await expect(
      service.stopSchedule({
        scheduleId: 496,
        stoppedByUserId: null,
        reason: 'source_deleted',
      })
    ).resolves.toEqual({
      notificationScheduleId: 496,
      status: 'stopped',
    });
    expect(repository.stopSchedule).toHaveBeenCalledWith(
      496,
      null,
      'source_deleted',
      expect.any(String)
    );
  });

  it.each(['not_found', 'not_allowed'] as const)(
    '%sを公開してControllerがHTTPエラーへ変換できる結果にする',
    async status => {
      const result = await createNotificationStopService({
        repository: {
          stopSchedule: vi.fn().mockResolvedValue(status),
        },
      }).stopSchedule({
        scheduleId: 496,
        stoppedByUserId: 12,
        reason: 'manual',
      });
      expect(result).toEqual({
        notificationScheduleId: 496,
        status,
      });
    }
  );
});
