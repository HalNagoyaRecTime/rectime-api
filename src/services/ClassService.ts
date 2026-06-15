import {
  ClassDTO,
  ClassRepositoryFunctions,
  ClassServiceFunctions,
} from '../types';

export function createClassService(
  classRepository: ClassRepositoryFunctions
): ClassServiceFunctions {
  return {
    async getAllClasses(): Promise<ClassDTO[]> {
      const classes = await classRepository.findAll();
      if (!classes) {
        throw new Error('Class not found');
      }
      return classes.map(classroom => ({
        ClassRoomId: classroom.f_class_room_id,
        ClassCode: classroom.f_class_code,
        Name: classroom.f_name,
      }));
    },
  };
}
