import type { ScheduleUpdateDTO } from '../dto/ScheduleDTO';
import type { ScheduleUpdateEntity } from '../../domain/entities/Schedule';
import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import type { IScheduleService } from './IScheduleService';

export function createScheduleService(
  scheduleRepository: IScheduleRepository
): IScheduleService {
  const toUpdateDTO = (schedule: ScheduleUpdateEntity): ScheduleUpdateDTO => ({
    ...schedule,
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
