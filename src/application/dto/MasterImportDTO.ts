import type {
  MasterImportCommittedResult,
  MasterImportStatus,
  MasterImportType,
} from '../../domain/entities/MasterImport';

export interface MasterImportSessionDTO {
  import_id: string;
  type: MasterImportType;
  status: MasterImportStatus;
  file_name: string;
  total: number;
  success_count: number;
  error_count: number;
  errors: unknown[];
  rows: unknown[];
  rows_total: number;
  rows_limit: number;
  rows_offset: number;
  created_at: string;
  committed_result: MasterImportCommittedResult | null;
}
