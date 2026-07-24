import { describe, expect, it, vi } from 'vitest';
import { createClassRoomService } from '../../../src/application/services/ClassRoomService';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';
import type { ClassRoomEntity } from '../../../src/domain/entities/ClassRoom';

function createRepository(
  overrides: Partial<IClassRoomRepository> = {}
): IClassRoomRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    createMany: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('ClassRoomService', () => {
  describe('getAllClassRooms', () => {
    it('ClassRoomEntity の配列を ClassRoomDTO の配列にマッピングして返す', async () => {
      const classRooms: ClassRoomEntity[] = [
        { class_room_id: 1, class_code: '11A', class_name: '1年Aクラス' },
        { class_room_id: 2, class_code: '12B', class_name: '2年Bクラス' },
      ];
      const repository = createRepository({
        findAll: vi.fn().mockResolvedValue(classRooms),
      });
      const service = createClassRoomService(repository);

      const dtos = await service.getAllClassRooms();

      expect(dtos).toEqual([
        { class_room_id: 1, class_code: '11A', class_name: '1年Aクラス' },
        { class_room_id: 2, class_code: '12B', class_name: '2年Bクラス' },
      ]);
      expect(repository.findAll).toHaveBeenCalled();
    });

    it('リポジトリが空配列を返す場合は空配列を返す', async () => {
      const repository = createRepository();
      const service = createClassRoomService(repository);

      await expect(service.getAllClassRooms()).resolves.toEqual([]);
    });
  });

  describe('validateClassRoomImport', () => {
    it('全行が有効な場合はerrorsが空になり、DBへの書き込みは行わない', async () => {
      const createMany = vi.fn();
      const repository = createRepository({ createMany });
      const service = createClassRoomService(repository);

      const result = await service.validateClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13D', class_name: '3年Dクラス' },
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

    it('既存DBとクラス記号が重複する行はエラーとして報告する', async () => {
      const repository = createRepository({
        findAll: vi
          .fn()
          .mockResolvedValue([
            { class_room_id: 1, class_code: '13C', class_name: '3年Cクラス' },
          ]),
      });
      const service = createClassRoomService(repository);

      const result = await service.validateClassRoomImport({
        rows: [{ class_code: '13C', class_name: '3年Cクラス(重複)' }],
      });

      expect(result).toEqual({
        total: 1,
        success_count: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 0,
            reason: 'class_code_duplicate_in_db',
          }),
        ],
      });
    });

    it('ファイル内でクラス記号が重複する行はエラーとして報告する', async () => {
      const repository = createRepository();
      const service = createClassRoomService(repository);

      const result = await service.validateClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13C', class_name: '3年Cクラス(重複)' },
        ],
      });

      expect(result.success_count).toBe(1);
      expect(result.errors).toEqual([
        expect.objectContaining({
          row_index: 1,
          reason: 'class_code_duplicate_in_file',
        }),
      ]);
    });
  });

  describe('commitClassRoomImport', () => {
    it('全行が有効な場合は全件分をまとめてcreateManyに渡す', async () => {
      const createMany = vi.fn().mockResolvedValue([
        { class_room_id: 1, class_code: '13C', class_name: '3年Cクラス' },
        { class_room_id: 2, class_code: '13D', class_name: '3年Dクラス' },
      ]);
      const repository = createRepository({ createMany });
      const service = createClassRoomService(repository);

      const result = await service.commitClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13D', class_name: '3年Dクラス' },
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
        { classCode: '13C', name: '3年Cクラス' },
        { classCode: '13D', name: '3年Dクラス' },
      ]);
    });

    it('クラス記号が重複する行がある場合は1件も登録しない', async () => {
      const createMany = vi.fn();
      const repository = createRepository({
        findAll: vi
          .fn()
          .mockResolvedValue([
            { class_room_id: 1, class_code: '13C', class_name: '3年Cクラス' },
          ]),
        createMany,
      });
      const service = createClassRoomService(repository);

      const result = await service.commitClassRoomImport({
        rows: [{ class_code: '13C', class_name: '3年Cクラス(重複)' }],
      });

      expect(result).toEqual({
        total: 1,
        imported: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 0,
            reason: 'class_code_duplicate_in_db',
          }),
        ],
      });
      expect(createMany).not.toHaveBeenCalled();
    });
  });
});
