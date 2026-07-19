import {
  TeacherEntity,
  TeacherPage,
  TeacherSearchFilter,
  TeacherUpdateInput,
} from '../../entities/Teacher';

export interface ITeacherRepository {
  findById: (id: number) => Promise<TeacherEntity | null>;
  findAll: (filter?: TeacherSearchFilter) => Promise<TeacherPage>;
  existsClassRooms: (classRoomIds: number[]) => Promise<boolean>;
  update: (
    id: number,
    input: TeacherUpdateInput
  ) => Promise<TeacherEntity | null>;
  hasClassAssignments: (id: number) => Promise<boolean>;
  delete: (id: number) => Promise<boolean>;
}
