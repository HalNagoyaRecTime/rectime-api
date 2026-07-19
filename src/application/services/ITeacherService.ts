import type { TeacherDTO, TeacherListDTO } from '../dto/TeacherDTO';

export type GetTeachersInput = {
  teacherId?: number;
  displayName?: string;
  classRoomId?: number;
  isLiveActive?: number;
  page: number;
  perPage: number;
};

export type UpdateTeacherInput = {
  displayName?: string;
  isLiveActive?: number;
  classRoomIds?: number[];
};

export interface ITeacherService {
  getTeachers: (input: GetTeachersInput) => Promise<TeacherListDTO>;
  getTeacherById: (teacherId: number) => Promise<TeacherDTO>;
  updateTeacher: (teacherId: number, input: UpdateTeacherInput) => Promise<TeacherDTO>;
  deleteTeacher: (teacherId: number) => Promise<void>;
}
