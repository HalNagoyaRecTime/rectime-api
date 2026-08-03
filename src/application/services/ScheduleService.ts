import type { ScheduleUpdateDTO } from '../dto/ScheduleDTO';
import type { ScheduleUpdateEntity } from '../../domain/entities/Schedule';
import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import type { IScheduleService } from './IScheduleService';

export function createScheduleService(
  scheduleRepository: IScheduleRepository
): IScheduleService {
  const toUpdateDTO = (schedule: ScheduleUpdateEntity): ScheduleUpdateDTO => ({
    create_user_id: schedule.create_user_id,
    new_event_id: schedule.new_event_id,
    new_importance: schedule.new_importance,
    new_send_at: schedule.new_send_at,
    new_gathering_id: schedule.new_gathering_id,
  });

  return {
    updateSchedule: async (notificationId, scheduleUpdate) => {
      const updatedSchedule = await scheduleRepository.updateSchedule(
        notificationId,
        scheduleUpdate
      );
      return toUpdateDTO(updatedSchedule);
    },
  };
}
