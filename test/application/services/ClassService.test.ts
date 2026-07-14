import { describe, expect, it, vi } from 'vitest';
import { createClassService } from '../../../src/application/services/ClassService';
import type { IClassRepository } from '../../../src/domain/interfaces/repositories/IClassRepository';
import type { ClassEntity } from '../../../src/domain/entities/Class';

describe('ClassService', () => {
  describe('getAllClasses', () => {
    it('ClassEntity の配列を ClassDTO の配列にマッピングして返す', async () => {
      const classes: ClassEntity[] = [
        { f_class_room_id: 1, f_class_code: '11A', f_name: '1年Aクラス' },
        { f_class_room_id: 2, f_class_code: '12B', f_name: '2年Bクラス' },
      ];
      const repository: IClassRepository = {
        findAll: vi.fn().mockResolvedValue(classes),
        findById: vi.fn(),
      };
      const service = createClassService(repository);

      const dtos = await service.getAllClasses();

      expect(dtos).toEqual([
        { class_room_id: 1, class_code: '11A', name: '1年Aクラス' },
        { class_room_id: 2, class_code: '12B', name: '2年Bクラス' },
      ]);
      expect(repository.findAll).toHaveBeenCalled();
    });

    it('リポジトリが空配列を返す場合は空配列を返す', async () => {
      const repository: IClassRepository = {
        findAll: vi.fn().mockResolvedValue([]),
        findById: vi.fn(),
      };
      const service = createClassService(repository);

      await expect(service.getAllClasses()).resolves.toEqual([]);
    });
  });
});
