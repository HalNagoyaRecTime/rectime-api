import { TeacherDTO } from '../dto/TeacherDTO';
import type { TeacherEntity } from '../../domain/entities/Teacher';
import { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import { ITeacherService } from './ITeacherService';

function toDTO(teacher: TeacherEntity): TeacherDTO {
  return {
    teacher_id: teacher.teacher_id,
    user_id: teacher.user_id,
    display_name: teacher.user_name,
  };
}

export function createTeacherService(
  teacherRepository: ITeacherRepository
): ITeacherService {
  return {
    async getTeacherById(id: number): Promise<TeacherDTO> {
      const teacher = await teacherRepository.findById(id);
      if (!teacher) {
        throw new Error('Teacher not found');
      }
      return toDTO(teacher);
    },
    async getAllTeachers(): Promise<TeacherDTO[]> {
      const teachers = await teacherRepository.findAll();
      if (!teachers) {
        throw new Error('Teacher not found');
      }
      return teachers.map(toDTO);
    },
  };
}
