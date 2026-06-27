import { ScheduleType } from '../../domain/entities/Schedule';

export interface ScheduleDTO {
  schedule_id: number;
  schedule_type: ScheduleType;
  name: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  order: number;
}
