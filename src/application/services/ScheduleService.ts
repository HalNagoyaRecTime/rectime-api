import type { ScheduleDTO, ScheduleHistoryDTO } from '../dto/ScheduleDTO';
import type {
  ScheduleEntity,
  ScheduleHistoryEntity,
} from '../../domain/entities/Schedule';
import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import type { IScheduleService } from './IScheduleService';

export function createScheduleService(
  scheduleRepository: IScheduleRepository
): IScheduleService {
  const toDTO = (schedule: ScheduleEntity): ScheduleDTO => ({
    ...schedule,
  });
  const toHistoryDTO = (
    HistorySchedule: ScheduleHistoryEntity
  ): ScheduleHistoryDTO => ({
    ...HistorySchedule,
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
    // deleteSchedule: async (id: number, res: String) => {
    //   await scheduleRepository.deleteById(id, res);
    // },
    getHistorySchedules: async (user_id: number) => {
      const schedule = await scheduleRepository.findByUserId(user_id);
      return schedule ? toHistoryDTO(schedule) : null;
    },
  };
}
