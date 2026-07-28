import { ScheduleEntity, ScheduleHistoryEntity } from '../../entities/Schedule';

export interface IScheduleRepository {
  findAll: () => Promise<ScheduleEntity>;
  findById: (id: number) => Promise<ScheduleEntity | null>;
  findByUserId: (user_id: number) => Promise<ScheduleHistoryEntity | null>;
}
