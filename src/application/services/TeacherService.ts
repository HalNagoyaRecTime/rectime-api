import {
  TeacherDTO,
  TeacherImportCommitResult,
  TeacherImportErrorReason,
  TeacherImportInput,
  TeacherImportRow,
  TeacherImportRowError,
  TeacherImportValidationResult,
  TeacherPageDTO,
} from '../dto/TeacherDTO';
import type {
  TeacherClassRoomEntity,
  TeacherEntity,
  TeacherSearchFilter,
} from '../../domain/entities/Teacher';
import { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import type { IClassRoomRepository } from '../../domain/interfaces/repositories/IClassRoomRepository';
import {
  ITeacherService,
  TeacherCreateRequest,
  TeacherUpdateRequest,
} from './ITeacherService';

function toClassRoomDTO(
  classRoom: TeacherClassRoomEntity
): TeacherDTO['class_rooms'][number] {
  return {
    class_room_id: classRoom.classRoomId,
    class_code: classRoom.classCode,
    class_name: classRoom.className,
  };
}

function toDTO(teacher: TeacherEntity): TeacherDTO {
  return {
    teacher_id: teacher.teacherId,
    user_id: teacher.userId,
    display_name: teacher.userName,
    email: teacher.email,
    is_live_active: teacher.isLiveActive,
    is_staff: teacher.isStaff,
    class_rooms: teacher.classRooms.map(toClassRoomDTO),
  };
}

// メールアドレスは大文字・小文字を区別しないため、保存前に小文字へ正規化する。
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function rethrowDuplicateEmail(error: unknown): never {
  if (
    error instanceof Error &&
    error.message.includes('UNIQUE') &&
    error.message.includes('teachers.email')
  ) {
    throw new Error('Teacher email already exists');
  }
  throw error;
}

async function findImportErrors(
  rows: TeacherImportRow[],
  teacherRepository: ITeacherRepository
): Promise<TeacherImportRowError[]> {
  const seenInFile = new Set<string>();
  const fileDuplicateRowIndexes = new Set<number>();
  const errors: TeacherImportRowError[] = [];
  const emailsToCheck: string[] = [];

  const pushError = (
    rowIndex: number,
    row: TeacherImportRow,
    reason: TeacherImportErrorReason
  ) => {
    errors.push({
      row_index: rowIndex + 1,
      last_name: row.last_name,
      first_name: row.first_name,
      email: row.email,
      reason,
    });
  };

  for (const [rowIndex, row] of rows.entries()) {
    if (seenInFile.has(row.email)) {
      fileDuplicateRowIndexes.add(rowIndex);
      pushError(rowIndex, row, 'email_duplicate_in_file');
      continue;
    }
    seenInFile.add(row.email);
    emailsToCheck.push(row.email);
  }

  const existingEmails =
    await teacherRepository.findExistingEmails(emailsToCheck);

  for (const [rowIndex, row] of rows.entries()) {
    if (fileDuplicateRowIndexes.has(rowIndex)) {
      continue;
    }
    if (existingEmails.has(row.email)) {
      pushError(rowIndex, row, 'email_duplicate_in_db');
    }
  }

  errors.sort((a, b) => a.row_index - b.row_index);
  return errors;
}

export function createTeacherService(
  teacherRepository: ITeacherRepository,
  classRoomRepository: IClassRoomRepository
): ITeacherService {
  const ensureClassRoomsExist = async (classRoomIds: number[]) => {
    if (classRoomIds.length === 0) return;
    const existingIds =
      await classRoomRepository.findExistingClassRoomIds(classRoomIds);
    if (existingIds.size !== classRoomIds.length) {
      throw new Error('Class room not found');
    }
  };

  return {
    async createTeacher(input: TeacherCreateRequest): Promise<TeacherDTO> {
      await ensureClassRoomsExist(input.classRoomIds);
      try {
        return toDTO(
          await teacherRepository.create({
            ...input,
            email: normalizeEmail(input.email),
          })
        );
      } catch (error) {
        rethrowDuplicateEmail(error);
      }
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
      // ここでの存在チェックは早期に分かりやすい400を返すためのもの。
      // チェック後にクラスが削除される競合が起きても、update() 側で同様の
      // 存在確認とアトミックな更新（users更新・担当クラスの解除・再設定を
      // batch()でまとめて実行）を行うため、教員情報や既存の担当クラスが
      // 中途半端な状態で残ることはない。
      const teacher = await teacherRepository.findById(id);
      if (!teacher) {
        throw new Error('Teacher not found');
      }
      await ensureClassRoomsExist(input.classRoomIds);
      let updated;
      try {
        updated = await teacherRepository.update(id, {
          ...input,
          email: normalizeEmail(input.email),
        });
      } catch (error) {
        rethrowDuplicateEmail(error);
      }
      if (!updated) {
        throw new Error('Teacher not found');
      }
      return toDTO(updated);
    },
    async validateTeacherImport(
      input: TeacherImportInput
    ): Promise<TeacherImportValidationResult> {
      const errors = await findImportErrors(input.rows, teacherRepository);
      return {
        total: input.rows.length,
        success_count: input.rows.length - errors.length,
        error_count: errors.length,
        errors,
      };
    },
    async commitTeacherImport(
      input: TeacherImportInput
    ): Promise<TeacherImportCommitResult> {
      const errors = await findImportErrors(input.rows, teacherRepository);
      if (errors.length > 0) {
        return {
          total: input.rows.length,
          imported: 0,
          error_count: errors.length,
          errors,
        };
      }

      await teacherRepository.createMany(
        input.rows.map(row => ({
          displayName: `${row.last_name}${row.first_name}`,
          email: normalizeEmail(row.email),
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
