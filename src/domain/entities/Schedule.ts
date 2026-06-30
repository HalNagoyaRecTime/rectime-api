export type ScheduleType = 'ceremony' | 'competition' | 'break' | 'other';

export interface ScheduleEntity {
  f_schedule_id: number;
  f_schedule_type: ScheduleType;
  f_name: string;
  f_description: string | null;
  f_start_time: string; // "HH:MM" 形式
  f_end_time: string; // "HH:MM" 形式
  f_location: string | null;
  f_order: number;
}
