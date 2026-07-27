import type {
  ClassRoomDTO,
  ClassRoomImportCommitResult,
  ClassRoomImportErrorReason,
  ClassRoomImportInput,
  ClassRoomImportRow,
  ClassRoomImportRowError,
  ClassRoomImportValidationResult,
  ClassRoomPageDTO,
  ClassRoomRequestDTO,
} from '../dto/ClassRoomDTO';
import type { ClassRoomEntity } from '../../domain/entities/ClassRoom';
import type { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import type { IClassRoomService } from './IClassRoomService';

async function findImportErrors(
  rows: ClassRoomImportRow[],
  classRoomRepository: IClassRoomRepository
): Promise<ClassRoomImportRowError[]> {
  const seenInFile = new Set<string>();
  const errors: ClassRoomImportRowError[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    const pushError = (reason: ClassRoomImportErrorReason) => {
      errors.push({
        row_index: rowIndex,
        class_code: row.class_code,
        class_name: row.class_name,
        reason,
      });
    };

    if (seenInFile.has(row.class_code)) {
      pushError('class_code_duplicate_in_file');
      continue;
    }
    seenInFile.add(row.class_code);

    if (await classRoomRepository.findByCode(row.class_code)) {
      pushError('class_code_duplicate_in_db');
    }
  }

  return errors;
}

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

    async validateClassRoomImport(
      input: ClassRoomImportInput
    ): Promise<ClassRoomImportValidationResult> {
      const errors = await findImportErrors(input.rows, classRoomRepository);
      return {
        total: input.rows.length,
        success_count: input.rows.length - errors.length,
        error_count: errors.length,
        errors,
      };
    },

    async commitClassRoomImport(
      input: ClassRoomImportInput
    ): Promise<ClassRoomImportCommitResult> {
      const errors = await findImportErrors(input.rows, classRoomRepository);
      if (errors.length > 0) {
        return {
          total: input.rows.length,
          imported: 0,
          error_count: errors.length,
          errors,
        };
      }

      await classRoomRepository.createMany(
        input.rows.map(row => ({
          class_code: row.class_code,
          class_name: row.class_name,
          teacher_id: null,
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
