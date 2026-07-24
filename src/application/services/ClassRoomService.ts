import type {
  ClassRoomDTO,
  ClassRoomPageDTO,
  ClassRoomRequestDTO,
} from '../dto/ClassRoomDTO';
import type { ClassRoomEntity } from '../../domain/entities/ClassRoom';
import type { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import type { IClassRoomService } from './IClassRoomService';

export function createClassRoomService(
  classRoomRepository: IClassRoomRepository
): IClassRoomService {
  const toDTO = (classroom: ClassRoomEntity): ClassRoomDTO => ({
    ...classroom,
  });

  const ensureTeacherExists = async (teacherId: number | null) => {
    if (
      teacherId !== null &&
      !(await classRoomRepository.teacherExists(teacherId))
    ) {
      throw new Error('Teacher not found');
    }
  };

  return {
    async getAllClassrooms(
      limit: number,
      offset: number
    ): Promise<ClassRoomPageDTO> {
      const result = await classRoomRepository.findAll(limit, offset);
      return {
        classrooms: result.classrooms.map(toDTO),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      };
    },

    async getClassroomById(id: number): Promise<ClassRoomDTO> {
      const classroom = await classRoomRepository.findById(id);
      if (!classroom) throw new Error('Class not found');
      return toDTO(classroom);
    },

    async createClassroom(input: ClassRoomRequestDTO): Promise<ClassRoomDTO> {
      await ensureTeacherExists(input.teacher_id);
      try {
        return toDTO(await classRoomRepository.create(input));
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) {
          throw new Error('Class code already exists');
        }
        throw error;
      }
    },

    async updateClassroom(
      id: number,
      input: ClassRoomRequestDTO
    ): Promise<ClassRoomDTO> {
      await ensureTeacherExists(input.teacher_id);
      try {
        const classroom = await classRoomRepository.update(id, input);
        if (!classroom) throw new Error('Class not found');
        return toDTO(classroom);
      } catch (error) {
        if (error instanceof Error && error.message.includes('UNIQUE')) {
          throw new Error('Class code already exists');
        }
        throw error;
      }
    },

    async deleteClassroom(id: number): Promise<void> {
      if (await classRoomRepository.hasStudents(id)) {
        throw new Error('Class is referenced by students');
      }
      if (!(await classRoomRepository.delete(id))) {
        throw new Error('Class not found');
      }
    },
  };
}
