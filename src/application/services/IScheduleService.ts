import {
  ScheduleDTO,
  ScheduleWriteDTO,
  ScheduleHistoryDTO,
} from '../dto/ScheduleDTO';

export interface IScheduleService {
  getAllSchedules: () => Promise<ScheduleDTO>;
  getScheduleById: (id: number) => Promise<ScheduleDTO | null>;
  createSchedule: (schedule: ScheduleWriteDTO) => Promise<ScheduleDTO>;
  deleteSchedule: (id: number) => Promise<void>;
  getHistorySchedules: (user_id: number) => Promise<ScheduleHistoryDTO | null>;
}
