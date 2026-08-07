import { TeacherDTO, TeacherPageDTO } from '../dto/TeacherDTO';
import { TeacherSearchFilter } from '../../domain/entities/Teacher';

export interface TeacherUpdateRequest {
  userName: string;
  isLiveActive: boolean;
  classRoomIds: number[];
}

export interface ITeacherService {
  getTeacherById: (id: number) => Promise<TeacherDTO>;
  getAllTeachers: (filter?: TeacherSearchFilter) => Promise<TeacherPageDTO>;
  createTeacher: (input: TeacherUpdateRequest) => Promise<TeacherDTO>;
  updateTeacher: (
    id: number,
    input: TeacherUpdateRequest
  ) => Promise<TeacherDTO>;
  deleteTeacher: (id: number) => Promise<void>;
}
