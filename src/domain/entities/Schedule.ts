export type ScheduleType = 'competition' | 'ceremony' | 'break' | 'other';

export interface ScheduleEntity {
  schedule_id: number;
  schedule_type: ScheduleType;
  name: string;
  description: string | null;
  start_time: string; // "HH:MM" 形式
  end_time: string; // "HH:MM" 形式
  location: string | null;
  order: number;
}
