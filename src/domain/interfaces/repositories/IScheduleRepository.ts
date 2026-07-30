import { ScheduleEntity, ScheduleWriteEntity } from '../../entities/Schedule';

export interface IScheduleRepository {
  findAll: () => Promise<ScheduleEntity>;
  findById: (id: number) => Promise<ScheduleEntity | null>;
  createSchedule: (
    schedule: ScheduleWriteEntity
  ) => Promise<ScheduleWriteEntity>;
}
