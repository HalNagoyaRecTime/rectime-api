import { DayScheduleItemType } from '../../domain/entities/DayScheduleItem';

export interface DayScheduleItemDTO {
  id: number;
  type: DayScheduleItemType;
  type_label: string;
  start_time: string;
  end_time: string;
  venue: string | null;
  meeting_place: string | null;
  related_competition_name: string | null;
  remarks: string | null;
  scheduled_post: string;
  order: number;
}
