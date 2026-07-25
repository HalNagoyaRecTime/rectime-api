import type { ScheduleDTO } from '../dto/ScheduleDTO';
import type { ScheduleEntity } from '../../domain/entities/Schedule';
import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import type { IScheduleService } from './IScheduleService';

export function createScheduleService(
  scheduleRepository: IScheduleRepository
): IScheduleService {
  const toDTO = (schedule: ScheduleEntity): ScheduleDTO => ({
    ...schedule,
  });

  return {
    getAllSchedules: async () => {
      const schedules = await scheduleRepository.findAll();
      return schedules.map(toDTO);
    },
  };
}
