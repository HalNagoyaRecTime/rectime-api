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
import type {
  ClassRoomEntity,
  ClassRoomInput,
  ClassRoomSearchFilter,
} from '../../domain/entities/ClassRoom';
import type { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import type { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';
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
  classRoomRepository: IClassRoomRepository,
  teacherRepository: ITeacherRepository,
  teamRepository: ITeamRepository
): IClassRoomService {
  const toDTO = (classroom: ClassRoomEntity): ClassRoomDTO => ({
    class_room_id: classroom.classRoomId,
    class_code: classroom.classCode,
    class_name: classroom.className,
    student_count: classroom.studentCount,
    team_id: classroom.teamId,
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
      !(await teacherRepository.existsById(teacherId))
    ) {
      throw new Error('Teacher not found');
    }
  };

  const ensureTeamExists = async (teamId: number | null) => {
    if (teamId !== null && !(await teamRepository.exists(teamId))) {
      throw new Error('Team not found');
    }
  };

  const toClassRoomInput = (input: ClassRoomRequestDTO): ClassRoomInput => ({
    classCode: input.classCode,
    className: input.className,
    teacherId: input.teacherId,
    teamId: input.teamId ?? null,
  });

  const mapWriteError = (error: unknown): never => {
    if (error instanceof Error) {
      if (error.message.includes('class_rooms.class_code')) {
        throw new Error('Class code already exists');
      }
      if (error.message.includes('teams.team_name')) {
        throw new Error('Team name already exists');
      }
    }
    throw error;
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
      await ensureTeamExists(input.teamId ?? null);
      try {
        return toDTO(await classRoomRepository.create(toClassRoomInput(input)));
      } catch (error) {
        throw mapWriteError(error);
      }
    },

    async updateClassRoom(
      id: number,
      input: ClassRoomRequestDTO
    ): Promise<ClassRoomDTO> {
      const existing = await classRoomRepository.findById(id);
      if (!existing) throw new Error('Class not found');
      await ensureTeacherExists(input.teacherId);
      await ensureTeamExists(input.teamId ?? null);
      try {
        const previous = await classRoomRepository.findById(id);
        const teamChanged =
          previous != null &&
          input.teamId != null &&
          previous.teamId !== input.teamId;

        const classroom = teamChanged
          ? await classRoomRepository.updateAndCleanupTeam(
              id,
              toClassRoomInput(input),
              previous.teamId
            )
          : await classRoomRepository.update(id, toClassRoomInput(input));
        if (!classroom) throw new Error('Class not found');

        return toDTO(classroom);
      } catch (error) {
        throw mapWriteError(error);
      }
    },

    async deleteClassRoom(id: number): Promise<void> {
      if (await classRoomRepository.hasStudents(id)) {
        throw new Error('Class is referenced by students');
      }
      const classroom = await classRoomRepository.findById(id);
      if (!classroom) throw new Error('Class not found');

      if (
        !(await classRoomRepository.deleteAndCleanupTeam(id, classroom.teamId))
      ) {
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
