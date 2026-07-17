import { TeacherDTO } from '../dto/TeacherDTO';

export interface ITeacherService {
  getTeacherById: (id: number) => Promise<TeacherDTO>;
  getAllTeachers: () => Promise<TeacherDTO[]>;
}
