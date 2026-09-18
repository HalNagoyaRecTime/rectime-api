import type { GatheringDetailsEntity } from '../../entities/Gathering';

export interface IGatheringRepository {
  findByEventId: (eventId: number) => Promise<GatheringDetailsEntity[]>;
  existsEvent: (eventId: number) => Promise<boolean>;
}
