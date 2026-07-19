import { ClassRoomDTO } from '../dto/ClassRoomDTO';
import { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import { IClassRoomService } from './IClassRoomService';

export function createClassRoomService(
  classRepository: IClassRoomRepository
): IClassRoomService {
  return {
    async putAllClassRooms(): Promise<ClassRoomDTO[]> {
      const classRooms = await classRepository.findAll();
      return classRooms.map(classroom => ({
        class_room_id: classroom.f_class_room_id,
        class_code: classroom.f_class_code,
        class_name: classroom.f_class_name,
      }));
    },
  };
}
