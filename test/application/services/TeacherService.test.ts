import { describe, expect, it, vi } from 'vitest';
import { createTeacherService } from '../../../src/application/services/TeacherService';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';

function createRepository(
  overrides: Partial<ITeacherRepository> = {}
): ITeacherRepository {
  return {
    create: vi.fn(),
    ...overrides,
  };
}

describe('TeacherService', () => {
  describe('validateTeacherImport', () => {
    it('重複チェックを行わず、常にerrorsが空の結果を返す(DBへの書き込みは行わない)', async () => {
      const create = vi.fn();
      const repository = createRepository({ create });
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
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('commitTeacherImport', () => {
    it('全行を作成する', async () => {
      const create = vi.fn().mockResolvedValue({
        teacher_id: 1,
        user_id: 1,
        user_name: '田中太郎',
      });
      const repository = createRepository({ create });
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
      expect(create).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenNthCalledWith(1, { displayName: '田中太郎' });
      expect(create).toHaveBeenNthCalledWith(2, { displayName: '佐藤花子' });
    });
  });
});
