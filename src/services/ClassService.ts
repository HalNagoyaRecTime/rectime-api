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
      return classes.map(classroom => ({
        class_room_id: classroom.f_class_room_id,
        class_code: classroom.f_class_code,
        name: classroom.f_name,
      }));
    },
  };
}
