import { DayScheduleItemDTO } from '../dto/DayScheduleItemDTO';
import { DayScheduleItemEntity } from '../../domain/entities/DayScheduleItem';
import { IDayScheduleRepository } from '../../domain/interfaces/repositories/IDayScheduleRepository';

export interface IDayScheduleService {
  getAllItems: () => Promise<DayScheduleItemDTO[]>;
}

function toDTO(item: DayScheduleItemEntity): DayScheduleItemDTO {
  return {
    id: item.id,
    type: item.type,
    type_label: item.type_label,
    start_time: item.start_time,
    end_time: item.end_time,
    venue: item.venue,
    meeting_place: item.meeting_place,
    related_competition_name: item.related_competition_name,
    remarks: item.remarks,
    scheduled_post: item.scheduled_post,
    order: item.order,
  };
}

export function createDayScheduleService(
  repository: IDayScheduleRepository
): IDayScheduleService {
  return {
    async getAllItems() {
      const items = await repository.findAll();
      return items.map(toDTO);
    },
  };
}
