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

export function createClassRoomService(
  classRoomRepository: IClassRoomRepository
): IClassRoomService {
  const toDTO = (classroom: ClassRoomEntity): ClassRoomDTO => ({
    class_room_id: classroom.classRoomId ?? classroom.class_room_id,
    class_code: classroom.classCode ?? classroom.class_code,
    class_name: classroom.className ?? classroom.class_name,
    student_count: classroom.studentCount ?? classroom.student_count,
    teacher: classroom.teacher
      ? {
          teacher_id:
            classroom.teacher.teacherId ?? classroom.teacher.teacher_id,
          user_id: classroom.teacher.userId ?? classroom.teacher.user_id,
          display_name:
            classroom.teacher.displayName ?? classroom.teacher.display_name,
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
    async getAllClassrooms(
      filterOrLimit: ClassRoomSearchFilter | number = {},
      legacyOffset?: number
    ): Promise<ClassRoomPageDTO> {
      const legacyCall = typeof filterOrLimit === 'number';
      const filter: ClassRoomSearchFilter =
        typeof filterOrLimit === 'number'
          ? { limit: filterOrLimit, offset: legacyOffset ?? 0 }
          : filterOrLimit;
      const result = await classRoomRepository.findAll(filter);
      const items = result.items ?? result.classrooms;
      const mapped = items.map(toDTO);
      return {
        ...(legacyCall ? { classrooms: mapped } : { items: mapped }),
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
      const normalized = {
        classCode: input.classCode ?? input.class_code!,
        className: input.className ?? input.class_name!,
        teacherId: input.teacherId ?? input.teacher_id ?? null,
        class_code: input.classCode ?? input.class_code!,
        class_name: input.className ?? input.class_name!,
        teacher_id: input.teacherId ?? input.teacher_id ?? null,
      };
      await ensureTeacherExists(normalized.teacherId);
      try {
        return toDTO(
          await classRoomRepository.create(
            input as ClassRoomRequestDTO & {
              class_code: string;
              class_name: string;
              teacher_id: number | null;
            }
          )
        );
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
      const normalized = {
        classCode: input.classCode ?? input.class_code!,
        className: input.className ?? input.class_name!,
        teacherId: input.teacherId ?? input.teacher_id ?? null,
        class_code: input.classCode ?? input.class_code!,
        class_name: input.className ?? input.class_name!,
        teacher_id: input.teacherId ?? input.teacher_id ?? null,
      };
      await ensureTeacherExists(normalized.teacherId);
      try {
        const classroom = await classRoomRepository.update(
          id,
          input as ClassRoomRequestDTO & {
            class_code: string;
            class_name: string;
            teacher_id: number | null;
          }
        );
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
