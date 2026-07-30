import { describe, expect, it, vi } from 'vitest';
import { createScheduleService } from '../../../src/application/services/ScheduleService';
import type { IScheduleRepository } from '../../../src/domain/interfaces/repositories/IScheduleRepository';
import type { ScheduleEntity } from '../../../src/domain/entities/Schedule';

describe('ScheduleService', () => {
  function setup() {
    const repository: IScheduleRepository = {
      findAll: vi.fn(),
      findById: vi.fn(),
      createSchedule: vi.fn(),
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

  it('IDでスケジュールを取得する', async () => {
    const { repository, service } = setup();
    (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(
      scheduleEntity
    );

    await expect(service.getScheduleById(1)).resolves.toEqual(scheduleEntity);
    expect(repository.findById).toHaveBeenCalledWith(1);
  });

  it('存在しないIDの場合はnullを返す', async () => {
    const { repository, service } = setup();
    (repository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.getScheduleById(999)).resolves.toBeNull();
  });

  it('スケジュールを作成する', async () => {
    const { repository, service } = setup();
    const input = {
      user_id: 1,
      event_id: 2,
      notification_id: 3,
      importance: 2,
      send_at: '2026-07-23T09:00:00.000Z',
    };
    const created = { ...input, firebase_token_id: 9 };
    (repository.createSchedule as ReturnType<typeof vi.fn>).mockResolvedValue(
      created
    );

    await expect(service.createSchedule(input)).resolves.toEqual(created);
    expect(repository.createSchedule).toHaveBeenCalledWith(input);
  });

  it('スケジュールを更新する', async () => {
    const { repository, service } = setup();
    const update = {
      user_id: 1,
      event_id: 2,
      importance: 2 as const,
      send_at: '2026-07-23T09:00:00.000Z',
      gathering_id: 3,
    };
    (repository.updateSchedule as ReturnType<typeof vi.fn>).mockResolvedValue(
      update
    );

    await expect(service.updateSchedule(4, update)).resolves.toEqual(update);
    expect(repository.updateSchedule).toHaveBeenCalledWith(4, update);
  });
});
