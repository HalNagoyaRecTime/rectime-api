import { describe, expect, it, vi } from 'vitest';
import { createTeacherService } from '../../../src/application/services/TeacherService';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';

function createRepository(
  overrides: Partial<ITeacherRepository> = {}
): ITeacherRepository {
  return {
    create: vi.fn(),
    createMany: vi.fn(),
    ...overrides,
  };
}

describe('TeacherService', () => {
  describe('validateTeacherImport', () => {
    it('重複チェックを行わず、常にerrorsが空の結果を返す(DBへの書き込みは行わない)', async () => {
      const createMany = vi.fn();
      const repository = createRepository({ createMany });
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
      const repository = createRepository({ createMany });
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
