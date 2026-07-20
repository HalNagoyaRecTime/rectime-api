import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTeacherRepository } from '../../../src/infrastructure/repositories/TeacherRepository';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';
import {
  seedStaffsTeachers,
  type SeededData,
} from '../../fixtures/staffsTeachers';

describe('TeacherRepository', () => {
  let repo: ITeacherRepository;
  let seeded: SeededData;

  beforeEach(async () => {
    seeded = await seedStaffsTeachers(env.DB);
    repo = createTeacherRepository(env.DB);
  });

  describe('findAll', () => {
    it('teachers に登録されている教員を全件返す', async () => {
      const result = await repo.findAll();

      expect(result.items).toHaveLength(seeded.teachers.length);
      expect(result.total).toBe(seeded.teachers.length);
      const names = result.items.map(t => t.user_name).sort();
      const expected = seeded.teachers.map(t => t.displayName).sort();
      expect(names).toEqual(expected);
    });

    it('担当クラスを含めて返す', async () => {
      const result = await repo.findAll();
      const assigned = result.items.find(
        t => t.teacher_id === seeded.teachers[0].teacherId
      );
      const unassigned = result.items.find(
        t => t.teacher_id === seeded.teachers[1].teacherId
      );

      expect(assigned?.class_rooms).toEqual([
        {
          class_room_id: seeded.classRooms[0].classRoomId,
          class_code: seeded.classRooms[0].classCode,
          class_name: seeded.classRooms[0].className,
        },
      ]);
      expect(unassigned?.class_rooms).toEqual([]);
    });

    it('teacherId で絞り込める', async () => {
      const target = seeded.teachers[0];
      const result = await repo.findAll({ teacherId: target.teacherId });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].teacher_id).toBe(target.teacherId);
      expect(result.total).toBe(1);
    });

    it('userName の部分一致で絞り込める', async () => {
      const target = seeded.teachers[0];
      const result = await repo.findAll({
        userName: target.displayName.slice(0, 2),
      });

      expect(result.items.map(t => t.teacher_id)).toContain(target.teacherId);
    });

    it('classRoomId で絞り込める', async () => {
      const result = await repo.findAll({
        classRoomId: seeded.classRooms[0].classRoomId,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].teacher_id).toBe(seeded.teachers[0].teacherId);
      expect(result.total).toBe(1);
    });

    it('isLiveActive で絞り込める', async () => {
      const result = await repo.findAll({ isLiveActive: true });
      expect(result.items).toHaveLength(seeded.teachers.length);
    });

    it('デフォルトは page=1, limit=20 で返す', async () => {
      const result = await repo.findAll();
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('page/limit でページ分けできる', async () => {
      const page1 = await repo.findAll({ page: 1, limit: 1 });
      const page2 = await repo.findAll({ page: 2, limit: 1 });

      expect(page1.items).toHaveLength(1);
      expect(page2.items).toHaveLength(1);
      expect(page1.total).toBe(seeded.teachers.length);
      expect(page2.total).toBe(seeded.teachers.length);
      // 2ページで重複なく全件をカバーする
      expect(page1.items[0].teacher_id).not.toBe(page2.items[0].teacher_id);
    });

    it('存在しないページ番号の場合は空配列を返すが total は維持する', async () => {
      const result = await repo.findAll({ page: 999, limit: 20 });
      expect(result.items).toEqual([]);
      expect(result.total).toBe(seeded.teachers.length);
    });
  });

  describe('findById', () => {
    it('teachers の id で教員を取得し、users・担当クラスを合わせて返す', async () => {
      const target = seeded.teachers[0];
      const teacher = await repo.findById(target.teacherId);

      expect(teacher).toMatchObject({
        teacher_id: target.teacherId,
        user_id: target.userId,
        user_name: target.displayName,
        is_live_active: true,
      });
      expect(teacher?.class_rooms).toEqual([
        {
          class_room_id: seeded.classRooms[0].classRoomId,
          class_code: seeded.classRooms[0].classCode,
          class_name: seeded.classRooms[0].className,
        },
      ]);
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });

  describe('existsClassRooms', () => {
    it('すべて存在する場合は true を返す', async () => {
      const ids = seeded.classRooms.map(c => c.classRoomId);
      expect(await repo.existsClassRooms(ids)).toBe(true);
    });

    it('存在しないクラスが含まれる場合は false を返す', async () => {
      expect(await repo.existsClassRooms([999999])).toBe(false);
    });

    it('空配列の場合は true を返す', async () => {
      expect(await repo.existsClassRooms([])).toBe(true);
    });
  });

  describe('update', () => {
    it('氏名・有効状態・担当クラスを更新する', async () => {
      const target = seeded.teachers[1];
      const updated = await repo.update(target.teacherId, {
        userName: '更新済み先生',
        isLiveActive: false,
        classRoomIds: [seeded.classRooms[1].classRoomId],
      });

      expect(updated).toMatchObject({
        teacher_id: target.teacherId,
        user_name: '更新済み先生',
        is_live_active: false,
      });
      expect(updated?.class_rooms).toEqual([
        {
          class_room_id: seeded.classRooms[1].classRoomId,
          class_code: seeded.classRooms[1].classCode,
          class_name: seeded.classRooms[1].className,
        },
      ]);

      const refetched = await repo.findById(target.teacherId);
      expect(refetched?.class_rooms).toEqual(updated?.class_rooms);
    });

    it('担当クラスを空にできる', async () => {
      const target = seeded.teachers[0];
      const updated = await repo.update(target.teacherId, {
        userName: target.displayName,
        isLiveActive: true,
        classRoomIds: [],
      });

      expect(updated?.class_rooms).toEqual([]);
    });

    it('存在しない教員IDの場合は null を返す', async () => {
      const updated = await repo.update(999999, {
        userName: 'x',
        isLiveActive: true,
        classRoomIds: [],
      });
      expect(updated).toBeNull();
    });

    it('存在しないクラスIDを含む場合は失敗し、氏名・有効状態・既存の担当クラスが変更前のまま残る（アトミック性）', async () => {
      const target = seeded.teachers[0];
      const beforeUserName = target.displayName;
      const beforeClassRooms = [
        {
          class_room_id: seeded.classRooms[0].classRoomId,
          class_code: seeded.classRooms[0].classCode,
          class_name: seeded.classRooms[0].className,
        },
      ];

      await expect(
        repo.update(target.teacherId, {
          userName: '更新失敗するはずの先生',
          isLiveActive: false,
          classRoomIds: [999999],
        })
      ).rejects.toThrow();

      const refetched = await repo.findById(target.teacherId);
      expect(refetched?.user_name).toBe(beforeUserName);
      expect(refetched?.is_live_active).toBe(true);
      expect(refetched?.class_rooms).toEqual(beforeClassRooms);
    });
  });

  describe('hasClassAssignments', () => {
    it('担当クラスがある場合は true を返す', async () => {
      expect(await repo.hasClassAssignments(seeded.teachers[0].teacherId)).toBe(
        true
      );
    });

    it('担当クラスがない場合は false を返す', async () => {
      expect(await repo.hasClassAssignments(seeded.teachers[1].teacherId)).toBe(
        false
      );
    });
  });

  describe('delete', () => {
    it('担当クラスがない教員を削除できる', async () => {
      const target = seeded.teachers[1];
      expect(await repo.delete(target.teacherId)).toBe(true);
      expect(await repo.findById(target.teacherId)).toBeNull();
    });

    it('存在しない教員IDの場合は false を返す', async () => {
      expect(await repo.delete(999999)).toBe(false);
    });
  });
});
