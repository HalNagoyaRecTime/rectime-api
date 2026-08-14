import {
  TeacherDTO,
  TeacherImportCommitResult,
  TeacherImportInput,
  TeacherImportValidationResult,
  TeacherPageDTO,
} from '../dto/TeacherDTO';
import type {
  TeacherEntity,
  TeacherSearchFilter,
} from '../../domain/entities/Teacher';
import { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import {
  ITeacherService,
  TeacherCreateRequest,
  TeacherUpdateRequest,
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

export function createTeacherService(
  teacherRepository: ITeacherRepository
): ITeacherService {
  return {
    async createTeacher(input: TeacherCreateRequest): Promise<TeacherDTO> {
      if (input.classRoomIds.length > 0) {
        const classRoomsExist = await teacherRepository.existsClassRooms(
          input.classRoomIds
        );
        if (!classRoomsExist) {
          throw new Error('Class room not found');
        }
      }
      return toDTO(await teacherRepository.create(input));
    },
    async getTeacherById(id: number): Promise<TeacherDTO> {
      const teacher = await teacherRepository.findById(id);
      if (!teacher) {
        throw new Error('Teacher not found');
      }
      return toDTO(teacher);
    },
    async getAllTeachers(
      filter?: TeacherSearchFilter
    ): Promise<TeacherPageDTO> {
      const page = await teacherRepository.findAll(filter);
      return {
        items: page.items.map(toDTO),
        total: page.total,
        limit: page.limit,
        offset: page.offset,
      };
    },
    async updateTeacher(
      id: number,
      input: TeacherUpdateRequest
    ): Promise<TeacherDTO> {
      if (input.classRoomIds.length > 0) {
        const classRoomsExist = await teacherRepository.existsClassRooms(
          input.classRoomIds
        );
        if (!classRoomsExist) {
          throw new Error('Class room not found');
        }
      }
      const updated = await teacherRepository.update(id, input);
      if (!updated) {
        throw new Error('Teacher not found');
      }
      return toDTO(updated);
    },
    async deleteTeacher(id: number): Promise<void> {
      const teacher = await teacherRepository.findById(id);
      if (!teacher) {
        throw new Error('Teacher not found');
      }
      const isReferenced = await teacherRepository.hasClassAssignments(id);
      if (isReferenced) {
        throw new Error('Teacher is referenced by other data');
      }
      const deleted = await teacherRepository.delete(id);
      if (!deleted) {
        throw new Error('Teacher not found');
      }
    },
    async validateTeacherImport(
      input: TeacherImportInput
    ): Promise<TeacherImportValidationResult> {
      return {
        total: input.rows.length,
        success_count: input.rows.length,
        error_count: 0,
        errors: [],
      };
    },
    async commitTeacherImport(
      input: TeacherImportInput
    ): Promise<TeacherImportCommitResult> {
      await teacherRepository.createMany(
        input.rows.map(row => ({
          displayName: `${row.last_name}${row.first_name}`,
        }))
      );
      return {
        total: input.rows.length,
        imported: input.rows.length,
        error_count: 0,
        errors: [],
      };
    },
  };
}
