import { ScheduleEntity } from '../../domain/entities/Schedule';

export interface IScheduleService {
  getAllSchedules(): Promise<ScheduleEntity[]>;
  getScheduleById(id: number): Promise<ScheduleEntity>;
}
