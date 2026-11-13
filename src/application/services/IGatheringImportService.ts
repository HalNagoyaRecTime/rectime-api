import type { GatheringImportResultDTO } from '../dto/GatheringImportDTO';

export interface GatheringImportCommand {
  event_id: number;
  csv_text: string;
}

export interface CommitGatheringImportCommand extends GatheringImportCommand {
  lock_version: number;
}

export interface IGatheringImportService {
  preview(command: GatheringImportCommand): Promise<GatheringImportResultDTO>;
  commit(
    command: CommitGatheringImportCommand
  ): Promise<GatheringImportResultDTO>;
}
