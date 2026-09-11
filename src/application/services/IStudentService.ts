import {
  StudentDTO,
  StudentManagementDTO,
  StudentImportCommitResult,
  StudentImportInput,
  StudentImportValidationResult,
  StudentPageDTO,
  StudentWriteDTO,
} from '../dto/StudentDTO';
import type { StudentSearchFilter } from '../../domain/entities/Student';

export interface IStudentService {
  getStudentById: (id: number) => Promise<StudentManagementDTO>;
  getByUserId: (userId: number) => Promise<StudentDTO>;
  getAllStudents: (options: StudentSearchFilter) => Promise<StudentPageDTO>;
  createStudent: (student: StudentWriteDTO) => Promise<StudentManagementDTO>;
  updateStudent: (
    id: number,
    student: StudentWriteDTO
  ) => Promise<StudentManagementDTO>;
  validateStudentImport: (
    input: StudentImportInput
  ) => Promise<StudentImportValidationResult>;
  commitStudentImport: (
    input: StudentImportInput
  ) => Promise<StudentImportCommitResult>;
}
