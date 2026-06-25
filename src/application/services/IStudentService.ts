import { StudentDTO } from '../dto/StudentDTO';

export interface IStudentService {
  getStudentById: (id: number) => Promise<StudentDTO>;
  getAllStudents: () => Promise<StudentDTO[]>;
}
