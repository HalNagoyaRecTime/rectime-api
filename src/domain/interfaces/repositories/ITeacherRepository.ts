import {
  TeacherEntity,
  TeacherCreateInput,
  TeacherPage,
  TeacherSearchFilter,
  TeacherUpdateInput,
} from '../../entities/Teacher';

export interface NewTeacherInput {
  displayName: string;
}

export interface ITeacherRepository {
  findById: (id: number) => Promise<TeacherEntity | null>;
  findAll: (filter?: TeacherSearchFilter) => Promise<TeacherPage>;
  existsClassRooms: (classRoomIds: number[]) => Promise<boolean>;
  create: {
    (input: TeacherCreateInput): Promise<TeacherEntity>;
    (input: NewTeacherInput): Promise<TeacherEntity>;
  };
  createMany: (inputs: NewTeacherInput[]) => Promise<void>;
  update: (
    id: number,
    input: TeacherUpdateInput
  ) => Promise<TeacherEntity | null>;
  hasClassAssignments: (id: number) => Promise<boolean>;
  delete: (id: number) => Promise<boolean>;
}
