import { ClassRoomDTO } from '../dto/ClassRoomDTO';

export interface IClassRoomService {
  getAllClassRooms: () => Promise<ClassRoomDTO[]>;
}
