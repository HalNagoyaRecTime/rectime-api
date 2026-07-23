import {
  BulkImportStudentsInput,
  BulkImportStudentsResult,
  StudentDTO,
  StudentPageDTO,
  StudentWriteDTO,
} from '../dto/StudentDTO';

export interface IStudentService {
  getStudentById: (id: number) => Promise<StudentDTO>;
  getAllStudents: (options: {
    limit: number;
    offset: number;
  }) => Promise<StudentPageDTO>;
  createStudent: (student: StudentWriteDTO) => Promise<StudentDTO>;
  updateStudent: (id: number, student: StudentWriteDTO) => Promise<StudentDTO>;
  bulkImportStudents: (
    input: BulkImportStudentsInput
  ) => Promise<BulkImportStudentsResult>;
}
