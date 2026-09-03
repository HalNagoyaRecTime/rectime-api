import type { MasterImportType } from '../../domain/entities/MasterImport';
import type { MasterImportSessionDTO } from '../dto/MasterImportDTO';

export interface CreateMasterImportInput {
  createUserId: number;
  type: MasterImportType;
  file: Blob;
  fileName: string;
}

export type CommitMasterImportOutcome =
  | { status: 'not_found' }
  | { status: 'has_errors'; session: MasterImportSessionDTO }
  | {
      status: 'committed';
      session: MasterImportSessionDTO;
      alreadyCommitted: boolean;
    }
  | { status: 'timeout' };

export interface IMasterImportService {
  createImport: (
    input: CreateMasterImportInput
  ) => Promise<MasterImportSessionDTO>;
  getImport: (
    validatedFileId: string,
    pagination: { offset: number; limit: number },
    createUserId: number
  ) => Promise<MasterImportSessionDTO | null>;
  commitImport: (
    validatedFileId: string,
    createUserId: number
  ) => Promise<CommitMasterImportOutcome>;
  // セッションが見つからないとき、期限切れか元から存在しないIDかを判定する。
  // 所有者が一致する場合のみtrueを返す
  isExpiredImport: (
    validatedFileId: string,
    createUserId: number
  ) => Promise<boolean>;
}
