import { ClassRoomDTO } from '../dto/ClassRoomDTO';

export interface IClassRoomService {
  putAllClassRooms: () => Promise<ClassRoomDTO[]>;
}
