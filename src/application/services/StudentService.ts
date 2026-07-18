import { CreateStudentInput, StudentDTO } from '../dto/StudentDTO';
import { StudentEntity } from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { IClassRepository } from '../../domain/interfaces/repositories/IClassRepository';
import { IStudentService } from './IStudentService';
import { ClassNotFoundError } from '../../domain/errors/ClassNotFoundError';
import { DuplicateStudentIdNumberError } from '../../domain/errors/DuplicateStudentIdNumberError';

function toStudentDTO(student: StudentEntity): StudentDTO {
  return {
    student_id: student.student_id,
    user_name: student.user_name,
    class_room_id: student.class_room_id,
    attendance_number: student.attendance_number,
    student_id_number: student.student_id_number,
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
        throw new ClassNotFoundError(input.class_room_id);
      }

      const existing = await studentRepository.findByStudentNum(
        input.student_id_number
      );
      if (existing) {
        throw new DuplicateStudentIdNumberError(input.student_id_number);
      }

      const student = await studentRepository.create({
        classRoomId: classRoom.f_class_room_id,
        userName: input.user_name,
        attendanceNumber: input.attendance_number,
        studentIdNumber: input.student_id_number,
      });

      return toStudentDTO(student);
    },
  };
}
