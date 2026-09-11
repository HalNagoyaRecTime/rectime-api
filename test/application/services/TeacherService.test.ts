import { describe, expect, it, vi } from 'vitest';
import { createTeacherService } from '../../../src/application/services/TeacherService';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';
import type { TeacherEntity } from '../../../src/domain/entities/Teacher';

function buildTeacher(overrides: Partial<TeacherEntity> = {}): TeacherEntity {
  return {
    teacherId: 1,
    userId: 10,
    userName: '山田先生',
    email: 'yamada@example.ac.jp',
    isLiveActive: true,
    isStaff: false,
    classRooms: [],
    ...overrides,
  };
}

function buildRepository(
  overrides: Partial<ITeacherRepository> = {}
): ITeacherRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findExistingEmails: vi.fn().mockResolvedValue(new Set<string>()),
    existsClassRooms: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    deleteByUserId: vi.fn(),
    ...overrides,
  };
}

describe('TeacherService', () => {
  describe('createTeacher', () => {
    it('クラス指定なしで作成しDTOへ変換する', async () => {
      const teacher = buildTeacher();
      const repository = buildRepository({
        create: vi.fn().mockResolvedValue(teacher),
      });
      const service = createTeacherService(repository);

      await expect(
        service.createTeacher({
          userName: '山田先生',
          email: 'yamada@example.ac.jp',
          classRoomIds: [],
        })
      ).resolves.toEqual({
        teacher_id: 1,
        user_id: 10,
        display_name: '山田先生',
        email: 'yamada@example.ac.jp',
        is_live_active: true,
        is_staff: false,
        class_rooms: [],
      });
      expect(repository.existsClassRooms).not.toHaveBeenCalled();
    });

    it('存在しないクラスを400相当のエラーとして拒否する', async () => {
      const repository = buildRepository({
        existsClassRooms: vi.fn().mockResolvedValue(false),
      });
      const service = createTeacherService(repository);
      await expect(
        service.createTeacher({
          userName: '山田先生',
          email: 'yamada@example.ac.jp',
          classRoomIds: [999],
        })
      ).rejects.toThrow('Class room not found');
      expect(repository.create).not.toHaveBeenCalled();
    });
  });
  describe('getTeacherById', () => {
    it('存在する場合は TeacherEntity を TeacherDTO にマッピングして返す', async () => {
      const teacher = buildTeacher();
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(teacher),
      });
      const service = createTeacherService(repository);

      const dto = await service.getTeacherById(1);

      expect(dto).toEqual({
        teacher_id: teacher.teacherId,
        user_id: teacher.userId,
        display_name: teacher.userName,
        email: teacher.email,
        is_live_active: teacher.isLiveActive,
        is_staff: false,
        class_rooms: teacher.classRooms.map(classRoom => ({
          class_room_id: classRoom.classRoomId,
          class_code: classRoom.classCode,
          class_name: classRoom.className,
        })),
      });
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = createTeacherService(repository);

      await expect(service.getTeacherById(999)).rejects.toThrow(
        'Teacher not found'
      );
    });

    it('無効な教員も取得できる', async () => {
      const repository = buildRepository({
        findById: vi
          .fn()
          .mockResolvedValue(buildTeacher({ isLiveActive: false })),
      });
      const service = createTeacherService(repository);

      await expect(service.getTeacherById(1)).resolves.toMatchObject({
        teacher_id: 1,
        is_live_active: false,
      });
    });
  });

  describe('getAllTeachers', () => {
    it('全件を TeacherDTO の配列にマッピングし、ページ情報を添えて返す', async () => {
      const teachers = [
        buildTeacher({ teacherId: 1 }),
        buildTeacher({ teacherId: 2, userName: '中村先生' }),
      ];
      const repository = buildRepository({
        findAll: vi.fn().mockResolvedValue({
          items: teachers,
          total: 2,
          limit: 20,
          offset: 0,
        }),
      });
      const service = createTeacherService(repository);

      const result = await service.getAllTeachers();

      expect(result.items).toHaveLength(2);
      expect(result.items.map(d => d.display_name)).toEqual([
        '山田先生',
        '中村先生',
      ]);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('検索条件をリポジトリに渡す', async () => {
      const repository = buildRepository({
        findAll: vi
          .fn()
          .mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }),
      });
      const service = createTeacherService(repository);

      await service.getAllTeachers({
        search: '山田',
        isStaff: false,
        isLiveActive: true,
        sortBy: 'classCode',
        sortOrder: 'desc',
        limit: 20,
        offset: 0,
      });

      expect(repository.findAll).toHaveBeenCalledWith({
        search: '山田',
        isStaff: false,
        isLiveActive: true,
        sortBy: 'classCode',
        sortOrder: 'desc',
        limit: 20,
        offset: 0,
      });
    });

    it('リポジトリが空件数を返す場合は空配列を返す', async () => {
      const repository = buildRepository({
        findAll: vi
          .fn()
          .mockResolvedValue({ items: [], total: 0, limit: 20, offset: 0 }),
      });
      const service = createTeacherService(repository);

      const result = await service.getAllTeachers();
      expect(result.items).toEqual([]);
    });
  });

  describe('updateTeacher', () => {
    it('担当クラスが存在すれば更新して TeacherDTO を返す', async () => {
      const updated = buildTeacher({
        userName: '更新済み先生',
        isLiveActive: false,
        classRooms: [{ classRoomId: 1, classCode: 'A', className: 'A組' }],
      });
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(buildTeacher()),
        existsClassRooms: vi.fn().mockResolvedValue(true),
        update: vi.fn().mockResolvedValue(updated),
      });
      const service = createTeacherService(repository);

      const dto = await service.updateTeacher(1, {
        userName: '更新済み先生',
        email: 'svc-1@example.ac.jp',
        classRoomIds: [1],
      });

      expect(repository.existsClassRooms).toHaveBeenCalledWith([1]);
      expect(repository.update).toHaveBeenCalledWith(1, {
        userName: '更新済み先生',
        email: 'svc-1@example.ac.jp',
        classRoomIds: [1],
      });
      expect(dto.display_name).toBe('更新済み先生');
    });

    it('存在しないクラスIDが含まれる場合はエラーを投げる', async () => {
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(buildTeacher()),
        existsClassRooms: vi.fn().mockResolvedValue(false),
      });
      const service = createTeacherService(repository);

      await expect(
        service.updateTeacher(1, {
          userName: 'x',
          email: 'svc-3@example.ac.jp',
          classRoomIds: [999],
        })
      ).rejects.toThrow('Class room not found');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('classRoomIds が空の場合は存在チェックをスキップする', async () => {
      const updated = buildTeacher();
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(buildTeacher()),
        existsClassRooms: vi.fn(),
        update: vi.fn().mockResolvedValue(updated),
      });
      const service = createTeacherService(repository);

      await service.updateTeacher(1, {
        userName: 'x',
        email: 'svc-4@example.ac.jp',
        classRoomIds: [],
      });

      expect(repository.existsClassRooms).not.toHaveBeenCalled();
    });

    it('教員が存在しない場合はエラーを投げる', async () => {
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(null),
        existsClassRooms: vi.fn().mockResolvedValue(true),
        update: vi.fn().mockResolvedValue(null),
      });
      const service = createTeacherService(repository);

      await expect(
        service.updateTeacher(999, {
          userName: 'x',
          email: 'svc-5@example.ac.jp',
          classRoomIds: [1],
        })
      ).rejects.toThrow('Teacher not found');
    });

    it('無効な教員も更新できる', async () => {
      const repository = buildRepository({
        findById: vi
          .fn()
          .mockResolvedValue(buildTeacher({ isLiveActive: false })),
        existsClassRooms: vi.fn().mockResolvedValue(true),
        update: vi
          .fn()
          .mockResolvedValue(buildTeacher({ isLiveActive: false })),
      });
      const service = createTeacherService(repository);

      await expect(
        service.updateTeacher(1, {
          userName: 'x',
          email: 'svc-6@example.ac.jp',
          classRoomIds: [1],
        })
      ).resolves.toMatchObject({ is_live_active: false });
    });
  });

  describe('メールアドレスの重複', () => {
    const uniqueError = new Error(
      'D1_ERROR: UNIQUE constraint failed: teachers.email: SQLITE_CONSTRAINT'
    );

    it('createTeacherは重複を専用のエラーへ変換する', async () => {
      const repository = buildRepository({
        existsClassRooms: vi.fn().mockResolvedValue(true),
        create: vi.fn().mockRejectedValue(uniqueError),
      });
      const service = createTeacherService(repository);

      await expect(
        service.createTeacher({
          userName: '山田先生',
          email: 'dup@example.ac.jp',
          classRoomIds: [],
        })
      ).rejects.toThrow('Teacher email already exists');
    });

    it('updateTeacherは重複を専用のエラーへ変換する', async () => {
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(buildTeacher()),
        existsClassRooms: vi.fn().mockResolvedValue(true),
        update: vi.fn().mockRejectedValue(uniqueError),
      });
      const service = createTeacherService(repository);

      await expect(
        service.updateTeacher(1, {
          userName: '山田先生',
          email: 'dup@example.ac.jp',
          classRoomIds: [],
        })
      ).rejects.toThrow('Teacher email already exists');
    });

    it('email以外のUNIQUE違反はそのまま伝播する', async () => {
      const otherError = new Error(
        'D1_ERROR: UNIQUE constraint failed: teachers.user_id: SQLITE_CONSTRAINT'
      );
      const repository = buildRepository({
        existsClassRooms: vi.fn().mockResolvedValue(true),
        create: vi.fn().mockRejectedValue(otherError),
      });
      const service = createTeacherService(repository);

      await expect(
        service.createTeacher({
          userName: '山田先生',
          email: 'ok@example.ac.jp',
          classRoomIds: [],
        })
      ).rejects.toThrow('teachers.user_id');
    });
  });

  describe('validateTeacherImport', () => {
    it('重複が無ければ全行を成功として返す(DBへの書き込みは行わない)', async () => {
      const createMany = vi.fn();
      const repository = buildRepository({ createMany });
      const service = createTeacherService(repository);

      const result = await service.validateTeacherImport({
        rows: [
          {
            last_name: '田中',
            first_name: '太郎',
            email: 'tanaka@example.ac.jp',
          },
          {
            last_name: '佐藤',
            first_name: '花子',
            email: 'sato@example.ac.jp',
          },
        ],
      });

      expect(result).toEqual({
        total: 2,
        success_count: 2,
        error_count: 0,
        errors: [],
      });
      expect(createMany).not.toHaveBeenCalled();
    });

    it('ファイル内でメールアドレスが重複した行をエラーにする', async () => {
      const service = createTeacherService(buildRepository());

      const result = await service.validateTeacherImport({
        rows: [
          { last_name: '田中', first_name: '太郎', email: 'dup@example.ac.jp' },
          { last_name: '佐藤', first_name: '花子', email: 'dup@example.ac.jp' },
        ],
      });

      expect(result.success_count).toBe(1);
      expect(result.errors).toEqual([
        {
          row_index: 2,
          last_name: '佐藤',
          first_name: '花子',
          email: 'dup@example.ac.jp',
          reason: 'email_duplicate_in_file',
        },
      ]);
    });

    it('既にDBに存在するメールアドレスの行をエラーにする', async () => {
      const repository = buildRepository({
        findExistingEmails: vi
          .fn()
          .mockResolvedValue(new Set(['exists@example.ac.jp'])),
      });
      const service = createTeacherService(repository);

      const result = await service.validateTeacherImport({
        rows: [
          { last_name: '田中', first_name: '太郎', email: 'new@example.ac.jp' },
          {
            last_name: '佐藤',
            first_name: '花子',
            email: 'exists@example.ac.jp',
          },
        ],
      });

      expect(result.success_count).toBe(1);
      expect(result.errors).toEqual([
        {
          row_index: 2,
          last_name: '佐藤',
          first_name: '花子',
          email: 'exists@example.ac.jp',
          reason: 'email_duplicate_in_db',
        },
      ]);
    });
  });

  describe('commitTeacherImport', () => {
    it('全行分をまとめてcreateManyに渡す', async () => {
      const createMany = vi.fn();
      const repository = buildRepository({ createMany });
      const service = createTeacherService(repository);

      const result = await service.commitTeacherImport({
        rows: [
          {
            last_name: '田中',
            first_name: '太郎',
            email: 'tanaka@example.ac.jp',
          },
          {
            last_name: '佐藤',
            first_name: '花子',
            email: 'sato@example.ac.jp',
          },
        ],
      });

      expect(result).toEqual({
        total: 2,
        imported: 2,
        error_count: 0,
        errors: [],
      });
      expect(createMany).toHaveBeenCalledTimes(1);
      expect(createMany).toHaveBeenCalledWith([
        { displayName: '田中太郎', email: 'tanaka@example.ac.jp' },
        { displayName: '佐藤花子', email: 'sato@example.ac.jp' },
      ]);
    });

    it('エラー行がある場合は1件も取り込まず、createManyを呼ばない', async () => {
      const createMany = vi.fn();
      const repository = buildRepository({
        createMany,
        findExistingEmails: vi
          .fn()
          .mockResolvedValue(new Set(['exists@example.ac.jp'])),
      });
      const service = createTeacherService(repository);

      const result = await service.commitTeacherImport({
        rows: [
          { last_name: '田中', first_name: '太郎', email: 'new@example.ac.jp' },
          {
            last_name: '佐藤',
            first_name: '花子',
            email: 'exists@example.ac.jp',
          },
        ],
      });

      expect(result.imported).toBe(0);
      expect(result.error_count).toBe(1);
      expect(createMany).not.toHaveBeenCalled();
    });
  });
});
