import {
  TeacherDTO,
  TeacherImportCommitResult,
  TeacherImportInput,
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
    is_live_active: teacher.isLiveActive,
    is_staff: teacher.isStaff,
    class_rooms: teacher.classRooms.map(toClassRoomDTO),
  };
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
      const updated = await teacherRepository.update(id, input);
      if (!updated) {
        throw new Error('Teacher not found');
      }
      return toDTO(updated);
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
