import { describe, expect, it, vi } from 'vitest';
import { createClassRoomService } from '../../../src/application/services/ClassRoomService';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';
import type { ClassRoomEntity } from '../../../src/domain/entities/ClassRoom';

describe('ClassRoomService', () => {
  describe('getAllClassRooms', () => {
    it('ClassRoomEntity の配列を ClassRoomDTO の配列にマッピングして返す', async () => {
      const classes: ClassRoomEntity[] = [
        { f_class_room_id: 1, f_class_code: '11A', f_class_name: '1年Aクラス' },
        { f_class_room_id: 2, f_class_code: '12B', f_class_name: '2年Bクラス' },
      ];
      const repository: IClassRoomRepository = {
        findAll: vi.fn().mockResolvedValue(classes),
      };
      const service = createClassRoomService(repository);

      const dtos = await service.getAllClassRooms();

      expect(dtos).toEqual([
        { class_room_id: 1, class_code: '11A', class_name: '1年Aクラス' },
        { class_room_id: 2, class_code: '12B', class_name: '2年Bクラス' },
      ]);
      expect(repository.findAll).toHaveBeenCalled();
    });

    it('リポジトリが空配列を返す場合は空配列を返す', async () => {
      const repository: IClassRoomRepository = {
        findAll: vi.fn().mockResolvedValue([]),
      };
      const service = createClassRoomService(repository);

      await expect(service.getAllClassRooms()).resolves.toEqual([]);
    });
  });
});
