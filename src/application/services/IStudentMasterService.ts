import {
  ImportStudentMasterInput,
  ImportStudentMasterResult,
} from '../dto/StudentMasterDTO';

export interface IStudentMasterService {
  importStudentMaster: (
    input: ImportStudentMasterInput
  ) => Promise<ImportStudentMasterResult>;
}
