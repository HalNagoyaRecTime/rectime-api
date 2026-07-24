import {
  ClassRoomEntity,
  ClassRoomInput,
  ClassRoomPage,
} from '../../entities/ClassRoom';

export interface IClassRoomRepository {
  findAll: (limit: number, offset: number) => Promise<ClassRoomPage>;
  findById: (id: number) => Promise<ClassRoomEntity | null>;
  create: (input: ClassRoomInput) => Promise<ClassRoomEntity>;
  update: (
    id: number,
    input: ClassRoomInput
  ) => Promise<ClassRoomEntity | null>;
  delete: (id: number) => Promise<boolean>;
  teacherExists: (id: number) => Promise<boolean>;
  hasStudents: (id: number) => Promise<boolean>;
}
