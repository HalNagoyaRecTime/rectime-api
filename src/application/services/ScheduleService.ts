import type { ScheduleDTO, ScheduleUpdateDTO } from '../dto/ScheduleDTO';
import type {
  ScheduleEntity,
  ScheduleUpdateEntity,
} from '../../domain/entities/Schedule';
import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import type { IScheduleService } from './IScheduleService';

export function createScheduleService(
  scheduleRepository: IScheduleRepository
): IScheduleService {
  const toDTO = (schedule: ScheduleEntity): ScheduleDTO => ({
    ...schedule,
  });
  const toUpdateDTO = (schedule: ScheduleUpdateEntity): ScheduleUpdateDTO => ({
    CreateUserId: schedule.CreateUserId,
    NewEventId: schedule.NewEventId,
    NewImportance: schedule.NewImportance,
    NewSendAt: schedule.NewSendAt,
    NewGatheringId: schedule.NewGatheringId,
  });

  return {
    getAllSchedules: async () => {
      const schedule = await scheduleRepository.findAll();
      return toDTO(schedule);
    },
    updateSchedule: async (notificationId, scheduleUpdate) => {
      const updatedSchedule = await scheduleRepository.updateSchedule(
        notificationId,
        scheduleUpdate
      );
      return toUpdateDTO(updatedSchedule);
    },
  };
}
