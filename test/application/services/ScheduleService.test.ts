import { describe, expect, it, vi } from 'vitest';
import { createScheduleService } from '../../../src/application/services/ScheduleService';
import type { IScheduleRepository } from '../../../src/domain/interfaces/repositories/IScheduleRepository';
import type { ScheduleEntity } from '../../../src/domain/entities/Schedule';

describe('ScheduleService', () => {
  function setup() {
    const repository: IScheduleRepository = {
      findAll: vi.fn(),
      updateSchedule: vi.fn(),
    };
    return {
      repository,
      service: createScheduleService(repository),
    };
  }

  const scheduleEntity: ScheduleEntity = {
    notification_schedules: [
      {
        notification_id: 1,
        notification_type: 'manual',
        title: '件名',
        body: '本文',
        created_user: { user_id: 1, user_name: '作成者' },
        event: {
          event_id: 2,
          event_name: '大縄跳び',
          start_time: '0900',
          end_time: '1000',
        },
        send_time: '2026-07-23T09:00:00.000Z',
        delivery_summary: {
          total: 1,
          draft: 1,
          sending: 0,
          sent: 0,
          failed: 0,
        },
      },
    ],
  };

  it('スケジュール一覧を取得する', async () => {
    const { repository, service } = setup();
    (repository.findAll as ReturnType<typeof vi.fn>).mockResolvedValue(
      scheduleEntity
    );

    await expect(service.getAllSchedules()).resolves.toEqual(scheduleEntity);
    expect(repository.findAll).toHaveBeenCalled();
  });

  it('スケジュールを更新する', async () => {
    const { repository, service } = setup();
    const update = {
      create_user_id: 1,
      new_event_id: 2,
      new_importance: 2,
      new_send_at: '2026-07-23T09:00:00.000Z',
      new_gathering_id: 3,
    };
    (repository.updateSchedule as ReturnType<typeof vi.fn>).mockResolvedValue(
      update
    );

    await expect(service.updateSchedule(4, update)).resolves.toEqual(update);
    expect(repository.updateSchedule).toHaveBeenCalledWith(4, update);
  });
});
