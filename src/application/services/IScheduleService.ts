import { ScheduleUpdateDTO } from '../dto/ScheduleDTO';

export interface IScheduleService {
  updateSchedule: (
    notificationId: number,
    scheduleUpdate: ScheduleUpdateDTO
  ) => Promise<ScheduleUpdateDTO>;
}
