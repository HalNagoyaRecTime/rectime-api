import { StudentDTO } from '../application/dto/StudentDTO';
import {
  StudentRepositoryFunctions,
  StudentServiceFunctions,
} from '../types';

export function createStudentService(
  studentRepository: StudentRepositoryFunctions
): StudentServiceFunctions {
  return {
    async getStudentById(id: number): Promise<StudentDTO> {
      const student = await studentRepository.findById(id);
      if (!student) {
        throw new Error('Student not found');
      }

      const dto = {
        student_id: student.f_student_id,
        display_name: student.f_display_name,
        class_room_id: student.f_class_room_id,
        uid: student.f_uid,
        attendance_number: student.f_attendance_number,
        student_id_number: student.f_student_id_number,
      } as StudentDTO;

      return dto;
    },
    async getAllStudents() {
      const students = await studentRepository.findAll();
      if (!students) {
        throw new Error('Student not found');
      }
      return students.map(student => ({
        student_id: student.f_student_id,
        display_name: student.f_display_name,
        class_room_id: student.f_class_room_id,
        uid: student.f_uid,
        attendance_number: student.f_attendance_number,
        student_id_number: student.f_student_id_number,
      }));
    },
  };
}
