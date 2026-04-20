import {
  StudentEntity,
  StudentRepositoryFunctions,
  StudentServiceFunctions,
} from '../types';

export function createStudentService(
  studentRepository: StudentRepositoryFunctions
): StudentServiceFunctions {
  return {
    async getStudentById(id: number): Promise<StudentEntity> {
      const student = await studentRepository.findById(id);
      if (!student) {
        throw new Error('Student not found');
      }
      return student;
    },
  };
}
