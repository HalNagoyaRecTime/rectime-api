import {
  ClassEntity,
  ClassRepositoryFunctions,
  ClassServiceFunctions,
} from '../types';

export function createClassService(
  classRepository: ClassRepositoryFunctions
): ClassServiceFunctions {
  return {
    async getAllClasses(): Promise<ClassEntity[]> {
      return classRepository.findAll();
    },
  };
}
