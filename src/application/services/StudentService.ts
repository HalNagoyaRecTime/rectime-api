import { CreateStudentInput, StudentDTO } from '../dto/StudentDTO';
import { StudentEntity } from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { IClassRepository } from '../../domain/interfaces/repositories/IClassRepository';
import { IStudentService } from './IStudentService';

function toStudentDTO(student: StudentEntity): StudentDTO {
  return {
    student_id: student.f_student_id,
    display_name: student.f_display_name,
    class_room_id: student.f_class_room_id,
    uid: student.f_uid,
    attendance_number: student.f_attendance_number,
    student_id_number: student.f_student_id_number,
  };
}

export function createStudentService(
  studentRepository: IStudentRepository,
  classRepository: IClassRepository
): IStudentService {
  return {
    async getStudentById(id: number): Promise<StudentDTO> {
      const student = await studentRepository.findById(id);
      if (!student) {
        throw new Error('Student not found');
      }

      return toStudentDTO(student);
    },
    async getAllStudents() {
      const students = await studentRepository.findAll();
      if (!students) {
        throw new Error('Student not found');
      }
      return students.map(toStudentDTO);
    },
    async createStudent(input: CreateStudentInput): Promise<StudentDTO> {
      const classRoom = await classRepository.findById(input.class_room_id);
      if (!classRoom) {
        throw new Error('Class not found');
      }

      const student = await studentRepository.create({
        classRoomId: classRoom.f_class_room_id,
        displayName: input.user_name,
        uid: input.uid,
        attendanceNumber: input.attendance_number,
        studentIdNumber: input.student_id_number,
      });

      return toStudentDTO(student);
    },
  };
}
