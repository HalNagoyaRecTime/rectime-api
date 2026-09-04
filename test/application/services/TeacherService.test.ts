import { describe, expect, it, vi } from 'vitest';
import { createTeacherService } from '../../../src/application/services/TeacherService';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';
import type { TeacherEntity } from '../../../src/domain/entities/Teacher';

function buildTeacher(overrides: Partial<TeacherEntity> = {}): TeacherEntity {
  return {
    teacher_id: 1,
    user_id: 10,
    user_name: '山田先生',
    is_live_active: true,
    is_staff: false,
    class_rooms: [],
    ...overrides,
  };
}

function buildRepository(
  overrides: Partial<ITeacherRepository> = {}
): ITeacherRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    existsClassRooms: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
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
        service.createTeacher({ userName: '山田先生', classRoomIds: [] })
      ).resolves.toEqual({
        teacher_id: 1,
        user_id: 10,
        display_name: '山田先生',
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
        service.createTeacher({ userName: '山田先生', classRoomIds: [999] })
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
        teacher_id: teacher.teacher_id,
        user_id: teacher.user_id,
        display_name: teacher.user_name,
        is_live_active: teacher.is_live_active,
        is_staff: false,
        class_rooms: teacher.class_rooms,
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
          .mockResolvedValue(buildTeacher({ is_live_active: false })),
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
        buildTeacher({ teacher_id: 1 }),
        buildTeacher({ teacher_id: 2, user_name: '中村先生' }),
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
        user_name: '更新済み先生',
        is_live_active: false,
        class_rooms: [{ class_room_id: 1, class_code: 'A', class_name: 'A組' }],
      });
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(buildTeacher()),
        existsClassRooms: vi.fn().mockResolvedValue(true),
        update: vi.fn().mockResolvedValue(updated),
      });
      const service = createTeacherService(repository);

      const dto = await service.updateTeacher(1, {
        userName: '更新済み先生',
        classRoomIds: [1],
      });

      expect(repository.existsClassRooms).toHaveBeenCalledWith([1]);
      expect(repository.update).toHaveBeenCalledWith(1, {
        userName: '更新済み先生',
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
          classRoomIds: [1],
        })
      ).rejects.toThrow('Teacher not found');
    });

    it('無効な教員も更新できる', async () => {
      const repository = buildRepository({
        findById: vi
          .fn()
          .mockResolvedValue(buildTeacher({ is_live_active: false })),
        existsClassRooms: vi.fn().mockResolvedValue(true),
        update: vi
          .fn()
          .mockResolvedValue(buildTeacher({ is_live_active: false })),
      });
      const service = createTeacherService(repository);

      await expect(
        service.updateTeacher(1, { userName: 'x', classRoomIds: [1] })
      ).resolves.toMatchObject({ is_live_active: false });
    });
  });

  describe('deleteTeacher', () => {
    it('論理削除を実行する', async () => {
      const repository = buildRepository({
        deactivate: vi.fn().mockResolvedValue(true),
      });
      const service = createTeacherService(repository);

      await service.deleteTeacher(1);

      expect(repository.deactivate).toHaveBeenCalledWith(1);
    });

    it('教員が存在しない場合はエラーを投げる', async () => {
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = createTeacherService(repository);

      await expect(service.deleteTeacher(999)).rejects.toThrow(
        'Teacher not found'
      );
    });

    it('担当クラスの有無にかかわらず論理削除する', async () => {
      const repository = buildRepository({
        deactivate: vi.fn().mockResolvedValue(true),
      });
      const service = createTeacherService(repository);

      await expect(service.deleteTeacher(1)).resolves.toBeUndefined();
      expect(repository.deactivate).toHaveBeenCalledWith(1);
    });
  });

  describe('validateTeacherImport', () => {
    it('重複チェックを行わず、常にerrorsが空の結果を返す(DBへの書き込みは行わない)', async () => {
      const createMany = vi.fn();
      const repository = buildRepository({ createMany });
      const service = createTeacherService(repository);

      const result = await service.validateTeacherImport({
        rows: [
          { last_name: '田中', first_name: '太郎' },
          { last_name: '佐藤', first_name: '花子' },
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
  });

  describe('commitTeacherImport', () => {
    it('全行分をまとめてcreateManyに渡す', async () => {
      const createMany = vi.fn();
      const repository = buildRepository({ createMany });
      const service = createTeacherService(repository);

      const result = await service.commitTeacherImport({
        rows: [
          { last_name: '田中', first_name: '太郎' },
          { last_name: '佐藤', first_name: '花子' },
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
        { displayName: '田中太郎' },
        { displayName: '佐藤花子' },
      ]);
    });
  });
});
