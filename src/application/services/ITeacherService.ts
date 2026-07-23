import {
  TeacherImportCommitResult,
  TeacherImportInput,
  TeacherImportValidationResult,
} from '../dto/TeacherDTO';

export interface ITeacherService {
  validateTeacherImport: (
    input: TeacherImportInput
  ) => Promise<TeacherImportValidationResult>;
  commitTeacherImport: (
    input: TeacherImportInput
  ) => Promise<TeacherImportCommitResult>;
}
