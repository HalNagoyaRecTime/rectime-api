import { ClassDTO, ClassPageDTO, ClassRequestDTO } from '../dto/ClassDTO';
import type { ClassEntity } from '../../domain/entities/Class';
import { IClassRepository } from '../../domain/interfaces/repositories/IClassRepository';
import { IClassService } from './IClassService';

export function createClassService(
  classRepository: IClassRepository
): IClassService {
  const toDTO = (classroom: ClassEntity): ClassDTO => ({ ...classroom });

  const ensureTeacherExists = async (teacherId: number | null) => {
    if (
      teacherId !== null &&
      !(await classRepository.teacherExists(teacherId))
    ) {
      throw new Error('Teacher not found');
    }
  };

  return {
    async getAllClassrooms(
      limit: number,
      offset: number
    ): Promise<ClassPageDTO> {
      const result = await classRepository.findAll(limit, offset);
      return {
        classrooms: result.classrooms.map(toDTO),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      };
    },

    async getClassById(id: number): Promise<ClassDTO> {
      const classroom = await classRepository.findById(id);
      if (!classroom) throw new Error('Class not found');
      return toDTO(classroom);
    },

    async createClass(input: ClassRequestDTO): Promise<ClassDTO> {
      await ensureTeacherExists(input.teacher_id);
      try {
        return toDTO(await classRepository.create(input));
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) {
          throw new Error('Class code already exists');
        }
        throw error;
      }
    },

    async updateClass(id: number, input: ClassRequestDTO): Promise<ClassDTO> {
      await ensureTeacherExists(input.teacher_id);
      try {
        const classroom = await classRepository.update(id, input);
        if (!classroom) throw new Error('Class not found');
        return toDTO(classroom);
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) {
          throw new Error('Class code already exists');
        }
        throw error;
      }
    },

    async deleteClass(id: number): Promise<void> {
      if (await classRepository.hasStudents(id)) {
        throw new Error('Class is referenced by students');
      }
      if (!(await classRepository.delete(id)))
        throw new Error('Class not found');
    },
  };
}
