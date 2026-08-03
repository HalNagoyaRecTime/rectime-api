import { describe, expect, it, vi } from 'vitest';
import { createScheduleService } from '../../../src/application/services/ScheduleService';
import type { IScheduleRepository } from '../../../src/domain/interfaces/repositories/IScheduleRepository';

describe('ScheduleService', () => {
  function setup() {
    const repository: IScheduleRepository = {
      updateSchedule: vi.fn(),
    };
    return {
      repository,
      service: createScheduleService(repository),
    };
  }

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
