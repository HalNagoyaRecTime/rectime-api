import {
  TeacherEntity,
  TeacherPage,
  TeacherSearchFilter,
  TeacherUpdateInput,
  TeacherCreateInput,
} from '../../entities/Teacher';

export interface NewTeacherInput {
  displayName: string;
}

export interface ITeacherRepository {
  findById: (id: number) => Promise<TeacherEntity | null>;
  findAll: (filter?: TeacherSearchFilter) => Promise<TeacherPage>;
  existsClassRooms: (classRoomIds: number[]) => Promise<boolean>;
  create: (
    input: NewTeacherInput | TeacherCreateInput
  ) => Promise<TeacherEntity>;
  createMany: (inputs: NewTeacherInput[]) => Promise<void>;
  update: (
    id: number,
    input: TeacherUpdateInput
  ) => Promise<TeacherEntity | null>;
}
