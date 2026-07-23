import { ClassRoomEntity } from '../../entities/ClassRoom';

export interface NewClassRoomInput {
  classCode: string;
  name: string;
}

export interface IClassRoomRepository {
  findAll: () => Promise<ClassRoomEntity[]>;
  create: (input: NewClassRoomInput) => Promise<ClassRoomEntity>;
}
