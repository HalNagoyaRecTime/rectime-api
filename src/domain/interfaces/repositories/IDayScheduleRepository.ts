import { DayScheduleItemEntity } from '../../entities/DayScheduleItem';

export interface IDayScheduleRepository {
  findAll: () => Promise<DayScheduleItemEntity[]>;
}
