import { ScheduleEntity } from '../../entities/Schedule';

export interface IScheduleRepository {
  findAll: () => Promise<ScheduleEntity>;
}
