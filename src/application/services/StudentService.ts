import { StudentDTO, StudentPageDTO, StudentWriteDTO } from '../dto/StudentDTO';
import type { StudentEntity } from '../../domain/entities/Student';
import { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import { IStudentService } from './IStudentService';

function toDTO(student: StudentEntity): StudentDTO {
  return {
    student_id: student.student_id,
    display_name: student.user_name,
    class_room_id: student.class_room_id,
    class_room_name: student.class_room_name,
    attendance_number: student.attendance_number,
    student_id_number: student.student_id_number,
    is_live_active: student.is_live_active,
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
    async getAllStudents({
      limit,
      offset,
    }: {
      limit: number;
      offset: number;
    }): Promise<StudentPageDTO> {
      const result = await studentRepository.findAll({ limit, offset });
      return {
        students: result.students.map(toDTO),
        total: result.total,
        limit,
        offset,
      };
    },

    async createStudent(student: StudentWriteDTO): Promise<StudentDTO> {
      await ensureClassRoomExists(student.class_room_id);
      await ensureStudentNumberAvailable(student.student_id_number);
      return toDTO(await studentRepository.create(student));
    },

    async updateStudent(
      id: number,
      student: StudentWriteDTO
    ): Promise<StudentDTO> {
      const existing = await studentRepository.findById(id);
      if (!existing) {
        throw new Error('Student not found');
      }

      await ensureClassRoomExists(student.class_room_id);
      const duplicate = await studentRepository.findByStudentNum(
        student.student_id_number
      );
      if (duplicate && duplicate.student_id !== id) {
        throw new Error('Student number already exists');
      }

      const updated = await studentRepository.update(id, student);
      if (!updated) {
        throw new Error('Student not found');
      }
      return toDTO(updated);
    },
  };

  async function ensureClassRoomExists(classRoomId: number): Promise<void> {
    if (!(await studentRepository.classRoomExists(classRoomId))) {
      throw new Error('Class room not found');
    }
  }

  async function ensureStudentNumberAvailable(
    studentNumber: string
  ): Promise<void> {
    if (await studentRepository.findByStudentNum(studentNumber)) {
      throw new Error('Student number already exists');
    }
  }
}
