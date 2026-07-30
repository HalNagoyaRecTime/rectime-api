import type { ScheduleDTO, ScheduleWriteDTO } from '../dto/ScheduleDTO';
import type {
  ScheduleEntity,
  ScheduleWriteEntity,
} from '../../domain/entities/Schedule';
import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import type { IScheduleService } from './IScheduleService';

export function createScheduleService(
  scheduleRepository: IScheduleRepository
): IScheduleService {
  const toDTO = (schedule: ScheduleEntity): ScheduleDTO => ({
    ...schedule,
  });
  const toWriteDTO = (schedule: ScheduleWriteEntity): ScheduleWriteDTO => ({
    ...schedule,
  });

  return {
    getAllSchedules: async () => {
      const schedule = await scheduleRepository.findAll();
      return toDTO(schedule);
    },
    getScheduleById: async (id: number) => {
      const schedule = await scheduleRepository.findById(id);
      return schedule ? toDTO(schedule) : null;
    },
    createSchedule: async schedule => {
      const createdSchedule = await scheduleRepository.createSchedule(schedule);
      return toWriteDTO(createdSchedule);
    },
  };
}
