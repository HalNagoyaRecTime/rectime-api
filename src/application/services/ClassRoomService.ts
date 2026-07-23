import { ClassRoomDTO } from '../dto/ClassRoomDTO';
import { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { IClassRoomService } from './IClassRoomService';

export function createClassRoomService(
  classRoomRepository: IClassRoomRepository
): IClassRoomService {
  return {
    async getAllClassRooms(): Promise<ClassRoomDTO[]> {
      const classRooms = await classRoomRepository.findAll();
      return classRooms.map(classroom => ({
        class_room_id: classroom.class_room_id,
        class_code: classroom.class_code,
        class_name: classroom.class_name,
      }));
    },
  };
}
