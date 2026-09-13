import {
  GatheringSpotEntity,
  GatheringSpotListOptions,
  GatheringSpotPage,
  UpdateGatheringSpotInput,
} from '../../entities/GatheringSpot';

export interface IGatheringSpotRepository {
  exists: (gatheringSpotId: number) => Promise<boolean>;
  // 複数の集合場所をまとめて確認する。1件ずつ exists を呼ぶとIDの数だけ
  // クエリが飛ぶため、存在するIDの集合を1回で返す。
  findExistingIds: (gatheringSpotIds: number[]) => Promise<Set<number>>;
  findAll: () => Promise<GatheringSpotEntity[]>;
  findPage: (options: GatheringSpotListOptions) => Promise<GatheringSpotPage>;
  findById: (gatheringSpotId: number) => Promise<GatheringSpotEntity | null>;
  create: (gatheringSpotName: string) => Promise<GatheringSpotEntity>;
  update: (
    gatheringSpotId: number,
    input: UpdateGatheringSpotInput
  ) => Promise<GatheringSpotEntity | null>;
  delete: (gatheringSpotId: number) => Promise<boolean>;
  hasGatherings: (gatheringSpotId: number) => Promise<boolean>;
}
