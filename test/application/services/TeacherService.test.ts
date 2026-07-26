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
    update: vi.fn(),
    hasClassAssignments: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  };
}

describe('TeacherService', () => {
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
  });

  describe('getAllTeachers', () => {
    it('全件を TeacherDTO の配列にマッピングし、ページ情報を添えて返す', async () => {
      const teachers = [
        buildTeacher({ teacher_id: 1 }),
        buildTeacher({ teacher_id: 2, user_name: '中村先生' }),
      ];
      const repository = buildRepository({
        findAll: vi
          .fn()
          .mockResolvedValue({ items: teachers, total: 2, page: 1, limit: 20 }),
      });
      const service = createTeacherService(repository);

      const result = await service.getAllTeachers();

      expect(result.items).toHaveLength(2);
      expect(result.items.map(d => d.display_name)).toEqual([
        '山田先生',
        '中村先生',
      ]);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total_pages).toBe(1);
    });

    it('検索条件をリポジトリに渡す', async () => {
      const repository = buildRepository({
        findAll: vi
          .fn()
          .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
      });
      const service = createTeacherService(repository);

      await service.getAllTeachers({ userName: '山田' });

      expect(repository.findAll).toHaveBeenCalledWith({ userName: '山田' });
    });

    it('リポジトリが空件数を返す場合は空配列と total_pages=0 を返す', async () => {
      const repository = buildRepository({
        findAll: vi
          .fn()
          .mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
      });
      const service = createTeacherService(repository);

      const result = await service.getAllTeachers();
      expect(result.items).toEqual([]);
      expect(result.total_pages).toBe(0);
    });

    it('total と limit から total_pages を切り上げで計算する', async () => {
      const repository = buildRepository({
        findAll: vi
          .fn()
          .mockResolvedValue({ items: [], total: 21, page: 1, limit: 20 }),
      });
      const service = createTeacherService(repository);

      const result = await service.getAllTeachers();
      expect(result.total_pages).toBe(2);
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
        existsClassRooms: vi.fn().mockResolvedValue(true),
        update: vi.fn().mockResolvedValue(updated),
      });
      const service = createTeacherService(repository);

      const dto = await service.updateTeacher(1, {
        userName: '更新済み先生',
        isLiveActive: false,
        classRoomIds: [1],
      });

      expect(repository.existsClassRooms).toHaveBeenCalledWith([1]);
      expect(repository.update).toHaveBeenCalledWith(1, {
        userName: '更新済み先生',
        isLiveActive: false,
        classRoomIds: [1],
      });
      expect(dto.display_name).toBe('更新済み先生');
    });

    it('存在しないクラスIDが含まれる場合はエラーを投げる', async () => {
      const repository = buildRepository({
        existsClassRooms: vi.fn().mockResolvedValue(false),
      });
      const service = createTeacherService(repository);

      await expect(
        service.updateTeacher(1, {
          userName: 'x',
          isLiveActive: true,
          classRoomIds: [999],
        })
      ).rejects.toThrow('Class room not found');
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('classRoomIds が空の場合は存在チェックをスキップする', async () => {
      const updated = buildTeacher();
      const repository = buildRepository({
        existsClassRooms: vi.fn(),
        update: vi.fn().mockResolvedValue(updated),
      });
      const service = createTeacherService(repository);

      await service.updateTeacher(1, {
        userName: 'x',
        isLiveActive: true,
        classRoomIds: [],
      });

      expect(repository.existsClassRooms).not.toHaveBeenCalled();
    });

    it('教員が存在しない場合はエラーを投げる', async () => {
      const repository = buildRepository({
        existsClassRooms: vi.fn().mockResolvedValue(true),
        update: vi.fn().mockResolvedValue(null),
      });
      const service = createTeacherService(repository);

      await expect(
        service.updateTeacher(999, {
          userName: 'x',
          isLiveActive: true,
          classRoomIds: [1],
        })
      ).rejects.toThrow('Teacher not found');
    });
  });

  describe('deleteTeacher', () => {
    it('担当クラスがなければ削除する', async () => {
      const teacher = buildTeacher();
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(teacher),
        hasClassAssignments: vi.fn().mockResolvedValue(false),
        delete: vi.fn().mockResolvedValue(true),
      });
      const service = createTeacherService(repository);

      await service.deleteTeacher(1);

      expect(repository.delete).toHaveBeenCalledWith(1);
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

    it('担当クラスがある場合はエラーを投げて削除しない', async () => {
      const teacher = buildTeacher();
      const repository = buildRepository({
        findById: vi.fn().mockResolvedValue(teacher),
        hasClassAssignments: vi.fn().mockResolvedValue(true),
      });
      const service = createTeacherService(repository);

      await expect(service.deleteTeacher(1)).rejects.toThrow(
        'Teacher is referenced by other data'
      );
      expect(repository.delete).not.toHaveBeenCalled();
    });
  });
});
