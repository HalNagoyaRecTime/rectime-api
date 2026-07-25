import type { ScheduleDTO } from '../dto/ScheduleDTO';

export interface IScheduleService {
  getAllSchedules: () => Promise<ScheduleDTO>;
}
