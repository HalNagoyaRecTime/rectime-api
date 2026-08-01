import { ScheduleDTO, ScheduleUpdateDTO } from '../dto/ScheduleDTO';

export interface IScheduleService {
  getAllSchedules: () => Promise<ScheduleDTO>;
  updateSchedule: (
    notificationId: number,
    scheduleUpdate: ScheduleUpdateDTO
  ) => Promise<ScheduleUpdateDTO>;
}
