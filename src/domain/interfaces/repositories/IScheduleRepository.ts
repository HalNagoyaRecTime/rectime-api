import { ScheduleUpdateEntity } from '../../entities/Schedule';

export interface IScheduleRepository {
  updateSchedule: (
    notificationId: number,
    scheduleUpdate: ScheduleUpdateEntity
  ) => Promise<ScheduleUpdateEntity>;
}
