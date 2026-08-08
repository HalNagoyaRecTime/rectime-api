import { TeacherDTO, TeacherPageDTO } from '../dto/TeacherDTO';
import {
  TeacherCreateInput,
  TeacherSearchFilter,
  TeacherUpdateInput,
} from '../../domain/entities/Teacher';

export type TeacherCreateRequest = TeacherCreateInput;
export type TeacherUpdateRequest = TeacherUpdateInput;

export interface ITeacherService {
  getTeacherById: (id: number) => Promise<TeacherDTO>;
  getAllTeachers: (filter?: TeacherSearchFilter) => Promise<TeacherPageDTO>;
  createTeacher: (input: TeacherCreateRequest) => Promise<TeacherDTO>;
  updateTeacher: (
    id: number,
    input: TeacherUpdateRequest
  ) => Promise<TeacherDTO>;
  deleteTeacher: (id: number) => Promise<void>;
}
