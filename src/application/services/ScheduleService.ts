import { ScheduleDTO } from '../dto/ScheduleDTO';
import { ScheduleEntity } from '../../domain/entities/Schedule';
import { IScheduleRepository } from '../../domain/interfaces/repositories/IScheduleRepository';
import { IScheduleService } from './IScheduleService';
import { ScheduleNotFoundError } from '../../domain/errors/ScheduleNotFoundError';

function toScheduleDTO(schedule: ScheduleEntity): ScheduleDTO {
  return {
    schedule_id: schedule.f_schedule_id,
    schedule_type: schedule.f_schedule_type,
    name: schedule.f_name,
    description: schedule.f_description,
    start_time: schedule.f_start_time,
    end_time: schedule.f_end_time,
    location: schedule.f_location,
    order: schedule.f_order,
  };
}

export function createScheduleService(
  scheduleRepository: IScheduleRepository
): IScheduleService {
  return {
    async getAllSchedules(): Promise<ScheduleDTO[]> {
      const schedules = await scheduleRepository.findAll();
      return schedules.map(toScheduleDTO);
    },

    async getScheduleById(id: number): Promise<ScheduleDTO> {
      const schedule = await scheduleRepository.findById(id);
      if (!schedule) {
        // メッセージ文字列ではなく専用エラークラスで「404 にすべき」意図を表現する
        throw new ScheduleNotFoundError(id);
      }
      return toScheduleDTO(schedule);
    },
  };
}
