import { TeacherEntity } from '../../entities/Teacher';

export interface ITeacherRepository {
  findById: (id: number) => Promise<TeacherEntity | null>;
  findAll: () => Promise<TeacherEntity[]>;
}
