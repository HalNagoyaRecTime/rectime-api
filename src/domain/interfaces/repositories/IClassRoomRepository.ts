import { ClassRoomEntity } from '../../entities/ClassRoom';

export interface IClassRoomRepository {
  findAll: () => Promise<ClassRoomEntity[]>;
}
