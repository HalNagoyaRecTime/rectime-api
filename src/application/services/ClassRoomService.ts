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
import type { ClassRoomSearchFilter } from '../../domain/entities/ClassRoom';
import type { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import type { IClassRoomService } from './IClassRoomService';

async function findImportErrors(
  rows: ClassRoomImportRow[],
  classRoomRepository: IClassRoomRepository
): Promise<ClassRoomImportRowError[]> {
  const seenInFile = new Set<string>();
  const fileDuplicateRowIndexes = new Set<number>();
  const errors: ClassRoomImportRowError[] = [];
  const codesToCheck: string[] = [];

  const pushError = (
    rowIndex: number,
    row: ClassRoomImportRow,
    reason: ClassRoomImportErrorReason
  ) => {
    errors.push({
      row_index: rowIndex + 1,
      class_code: row.class_code,
      class_name: row.class_name,
      reason,
    });
  };

  for (const [rowIndex, row] of rows.entries()) {
    if (seenInFile.has(row.class_code)) {
      fileDuplicateRowIndexes.add(rowIndex);
      pushError(rowIndex, row, 'class_code_duplicate_in_file');
      continue;
    }
    seenInFile.add(row.class_code);
    codesToCheck.push(row.class_code);
  }

  const existingCodes =
    await classRoomRepository.findExistingClassCodes(codesToCheck);

  for (const [rowIndex, row] of rows.entries()) {
    if (fileDuplicateRowIndexes.has(rowIndex)) {
      continue;
    }
    if (existingCodes.has(row.class_code)) {
      pushError(rowIndex, row, 'class_code_duplicate_in_db');
    }
  }

  errors.sort((a, b) => a.row_index - b.row_index);
  return errors;
}

function getErrorChainMessage(error: unknown): string {
  const messages: string[] = [];
  const visited = new Set<Error>();
  let current = error;

  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    messages.push(current.message);
    current = current.cause;
  }

  return messages.join(' ');
}

function isClassCodeUniqueError(error: unknown): boolean {
  const message = getErrorChainMessage(error);
  return (
    message.includes('UNIQUE') && message.includes('class_rooms.class_code')
  );
}

export function createClassRoomService(
  classRoomRepository: IClassRoomRepository
): IClassRoomService {
  const toDTO = (classroom: ClassRoomEntity): ClassRoomDTO => ({
    class_room_id: classroom.classRoomId,
    class_code: classroom.classCode,
    class_name: classroom.className,
    student_count: classroom.studentCount,
    teacher: classroom.teacher
      ? {
          teacher_id: classroom.teacher.teacherId,
          user_id: classroom.teacher.userId,
          display_name: classroom.teacher.displayName,
        }
      : null,
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
    async getAllClassRooms(
      filter: ClassRoomSearchFilter = {}
    ): Promise<ClassRoomPageDTO> {
      const result = await classRoomRepository.findAll(filter);
      return {
        items: result.items.map(toDTO),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
      };
    },

    async getClassRoomById(id: number): Promise<ClassRoomDTO> {
      const classroom = await classRoomRepository.findById(id);
      if (!classroom) throw new Error('Class not found');
      return toDTO(classroom);
    },

    async createClassRoom(input: ClassRoomRequestDTO): Promise<ClassRoomDTO> {
      await ensureTeacherExists(input.teacherId);
      try {
        return toDTO(await classRoomRepository.create(input));
      } catch (error) {
        if (isClassCodeUniqueError(error)) {
          throw new Error('Class code already exists');
        }
        throw error;
      }
    },

    async updateClassRoom(
      id: number,
      input: ClassRoomRequestDTO
    ): Promise<ClassRoomDTO> {
      const existing = await classRoomRepository.findById(id);
      if (!existing) throw new Error('Class not found');
      await ensureTeacherExists(input.teacherId);
      try {
        const classroom = await classRoomRepository.update(id, input);
        if (!classroom) throw new Error('Class not found');
        return toDTO(classroom);
      } catch (error) {
        if (isClassCodeUniqueError(error)) {
          throw new Error('Class code already exists');
        }
        throw error;
      }
    },

    async deleteClassRoom(id: number): Promise<void> {
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
          classCode: row.class_code,
          className: row.class_name,
          teacherId: null,
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
