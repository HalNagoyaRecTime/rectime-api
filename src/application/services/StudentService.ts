import { StudentDTO } from '../dto/StudentDTO';
import type { StudentEntity } from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { IStudentService } from './IStudentService';

function toDTO(student: StudentEntity): StudentDTO {
  return {
    student_id: student.student_id,
    display_name: student.user_name,
    class_room_id: student.class_room_id,
    attendance_number: student.attendance_number,
    student_id_number: student.student_id_number,
  };
}

export function createStudentService(
  studentRepository: IStudentRepository
): IStudentService {
  return {
    async getStudentById(id: number): Promise<StudentDTO> {
      const student = await studentRepository.findById(id);
      if (!student) {
        throw new Error('Student not found');
      }

      return toDTO(student);
    },
    async getAllStudents() {
      const students = await studentRepository.findAll();
      if (!students) {
        throw new Error('Student not found');
      }
      return students.map(toDTO);
    },
  };
}
