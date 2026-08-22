import {
  StudentDTO,
  StudentImportCommitResult,
  StudentImportInput,
  StudentImportValidationResult,
  StudentPageDTO,
  StudentWriteDTO,
} from '../dto/StudentDTO';

export interface IStudentService {
  getStudentById: (id: number) => Promise<StudentDTO>;
  getByUserId: (userId: number) => Promise<StudentDTO>;
  getAllStudents: (options: {
    limit: number;
    offset: number;
  }) => Promise<StudentPageDTO>;
  createStudent: (student: StudentWriteDTO) => Promise<StudentDTO>;
  deleteStudent: (id: number) => Promise<void>;
  updateStudent: (id: number, student: StudentWriteDTO) => Promise<StudentDTO>;
  validateStudentImport: (
    input: StudentImportInput
  ) => Promise<StudentImportValidationResult>;
  commitStudentImport: (
    input: StudentImportInput
  ) => Promise<StudentImportCommitResult>;
}
