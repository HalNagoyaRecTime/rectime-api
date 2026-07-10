import { NewStudentInput, StudentEntity } from '../../entities/Student';

export interface IStudentRepository {
  findById: (id: number) => Promise<StudentEntity | null>;
  findAll: () => Promise<StudentEntity[]>;
  findByStudentNum: (studentNum: string) => Promise<StudentEntity | null>;
  create: (input: NewStudentInput) => Promise<StudentEntity>;
}
