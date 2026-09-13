import type { GatheringDetailsEntity } from '../../entities/Gathering';

export interface IGatheringRepository {
  findAll: () => Promise<GatheringDetailsEntity[]>;
  findByEventId: (eventId: number) => Promise<GatheringDetailsEntity[]>;
  existsEvent: (eventId: number) => Promise<boolean>;
}
