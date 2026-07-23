import {
  BulkImportStudentsInput,
  BulkImportStudentsResult,
  CreateStudentInput,
  StudentDTO,
} from '../dto/StudentDTO';

export interface IStudentService {
  getStudentById: (id: number) => Promise<StudentDTO>;
  getAllStudents: () => Promise<StudentDTO[]>;
  createStudent: (input: CreateStudentInput) => Promise<StudentDTO>;
  bulkImportStudents: (
    input: BulkImportStudentsInput
  ) => Promise<BulkImportStudentsResult>;
}
