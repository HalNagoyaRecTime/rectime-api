import type { TeacherEntity } from '../../entities/Teacher';

export type TeacherSearchParams = {
  teacherId?: number;
  displayName?: string;
  classRoomId?: number;
  isLiveActive?: number;
  page: number;
  perPage: number;
};

export type TeacherSearchResult = {
  teachers: TeacherEntity[];
  total: number;
};

export type UpdateTeacherInput = {
  displayName?: string;
  isLiveActive?: number;
  classRoomIds?: number[];
};

export interface ITeacherRepository {
  findById: (id: number) => Promise<TeacherEntity | null>;
  search: (params: TeacherSearchParams) => Promise<TeacherSearchResult>;
  updateById: (
    teacherId: number,
    input: UpdateTeacherInput
  ) => Promise<TeacherEntity | null>;
  deleteById: (teacherId: number) => Promise<boolean>;
}
