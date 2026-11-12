export const GATHERING_IMPORT_ERROR_CODES = [
  'INVALID_ROUND',
  'INVALID_START_TIME',
  'INVALID_GATHERING_TIME',
  'GATHERING_SPOT_NOT_FOUND',
  'GATHERING_SPOT_AMBIGUOUS',
  'INVALID_STUDENT',
  'STUDENT_NOT_FOUND',
  'DUPLICATE_STUDENT',
  'ROUND_START_TIME_MISMATCH',
] as const;

export type GatheringImportErrorCode =
  (typeof GATHERING_IMPORT_ERROR_CODES)[number];

export interface GatheringImportErrorDTO {
  row_number: number;
  code: GatheringImportErrorCode;
  message: string;
  student: string;
}

export interface GatheringImportWarningDTO {
  row_number: number;
  code: 'NAME_MISMATCH';
  message: string;
  student: string;
  registered_name: string;
}

export interface GatheringImportMemberDTO {
  row_number: number;
  user_id: number;
  class_code: string;
  attendance_number: number;
  user_name: string;
}

export interface GatheringImportGatheringDTO {
  gathering_time: string;
  gathering_spot: {
    gathering_spot_id: number;
    gathering_spot_name: string;
  };
  members: GatheringImportMemberDTO[];
}

export interface GatheringImportRoundDTO {
  round: number;
  start_time: string | null;
  gatherings: GatheringImportGatheringDTO[];
}

export interface GatheringImportResultDTO {
  event_id: number;
  lock_version: number;
  total_rows: number;
  imported_rows: number;
  excluded_rows: number;
  rounds: GatheringImportRoundDTO[];
  errors: GatheringImportErrorDTO[];
  warnings: GatheringImportWarningDTO[];
}
