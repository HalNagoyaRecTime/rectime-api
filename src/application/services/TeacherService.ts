import type { TeacherDTO } from '../dto/TeacherDTO';
import type { TeacherEntity } from '../../domain/entities/Teacher';
import type {
  ITeacherRepository,
  TeacherSearchParams,
  UpdateTeacherInput as RepositoryUpdateTeacherInput,
} from '../../domain/interfaces/repositories/ITeacherRepository';
import type {
  GetTeachersInput,
  ITeacherService,
  UpdateTeacherInput,
} from './ITeacherService';

function toDTO(teacher: TeacherEntity): TeacherDTO {
  return {
    teacher_id: teacher.teacher_id,
    user_id: teacher.user_id,
    display_name: teacher.user_name,
    is_live_active: teacher.is_live_active,
    class_rooms: teacher.class_rooms,
  };
}

function toSearchParams(input: GetTeachersInput): TeacherSearchParams {
  return {
    teacherId: input.teacherId,
    displayName: input.displayName,
    classRoomId: input.classRoomId,
    isLiveActive: input.isLiveActive,
    page: input.page,
    perPage: input.perPage,
  };
}

function toRepositoryUpdateInput(
  input: UpdateTeacherInput
): RepositoryUpdateTeacherInput {
  return {
    displayName: input.displayName,
    isLiveActive: input.isLiveActive,
    classRoomIds: input.classRoomIds,
  };
}

export function createTeacherService(
  teacherRepository: ITeacherRepository
): ITeacherService {
  return {
    async getTeachers(input) {
      const result = await teacherRepository.search(toSearchParams(input));
      return {
        teachers: result.teachers.map(toDTO),
        total: result.total,
        page: input.page,
        per_page: input.perPage,
      };
    },

    async getTeacherById(teacherId: number) {
      const teacher = await teacherRepository.findById(teacherId);
      if (!teacher) {
        throw new Error('Teacher not found');
      }
      return toDTO(teacher);
    },

    async updateTeacher(teacherId: number, input: UpdateTeacherInput) {
      const updatedTeacher = await teacherRepository.updateById(
        teacherId,
        toRepositoryUpdateInput(input)
      );
      if (!updatedTeacher) {
        throw new Error('Teacher not found');
      }
      return toDTO(updatedTeacher);
    },

    async deleteTeacher(teacherId: number) {
      const deleted = await teacherRepository.deleteById(teacherId);
      if (!deleted) {
        throw new Error('Teacher not found');
      }
    },
  };
}
