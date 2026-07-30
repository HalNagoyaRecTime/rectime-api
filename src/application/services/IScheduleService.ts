import {
  ScheduleDTO,
  ScheduleWriteDTO,
  ScheduleUpdateDTO,
} from '../dto/ScheduleDTO';

export interface IScheduleService {
  getAllSchedules: () => Promise<ScheduleDTO>;
  getScheduleById: (id: number) => Promise<ScheduleDTO | null>;
  createSchedule: (schedule: ScheduleWriteDTO) => Promise<ScheduleWriteDTO>;
  updateSchedule: (
    notificationId: number,
    scheduleUpdate: ScheduleUpdateDTO
  ) => Promise<ScheduleUpdateDTO>;
}
