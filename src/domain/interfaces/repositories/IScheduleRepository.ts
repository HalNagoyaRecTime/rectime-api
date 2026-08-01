import { ScheduleEntity, ScheduleUpdateEntity } from '../../entities/Schedule';

export interface IScheduleRepository {
  findAll: () => Promise<ScheduleEntity>;
  updateSchedule: (
    notificationId: number,
    scheduleUpdate: ScheduleUpdateEntity
  ) => Promise<ScheduleUpdateEntity>;
}
