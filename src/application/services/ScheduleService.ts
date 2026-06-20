import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import { IScheduleService } from './IScheduleService';
import { ScheduleEntity } from '../../domain/entities/Schedule';

export function createScheduleService(
  scheduleRepository: IScheduleRepository
): IScheduleService {
  const getAllSchedules = async (): Promise<ScheduleEntity[]> => {
    return scheduleRepository.findAll();
  };

  const getScheduleById = async (id: number): Promise<ScheduleEntity> => {
    const schedule = await scheduleRepository.findById(id);
    if (!schedule) {
      throw new Error('Schedule not found');
    }
    return schedule;
  };

  return { getAllSchedules, getScheduleById };
}
