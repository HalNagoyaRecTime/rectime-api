import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

    it('userName に % や _ が含まれる場合、ワイルドカードとしてではなく文字通り一致で絞り込む', async () => {
      const now = new Date().toISOString();
      const wildcardUser = await env.DB.prepare(
        'INSERT INTO users (user_name, is_live_active, created_at, updated_at) VALUES (?, 1, ?, ?) RETURNING user_id'
      )
        .bind('50%_offプランナー', now, now)
        .first<{ user_id: number }>();
      const wildcardTeacher = await env.DB.prepare(
        'INSERT INTO teachers (user_id, created_at, updated_at) VALUES (?, ?, ?) RETURNING teacher_id'
      )
        .bind(wildcardUser!.user_id, now, now)
        .first<{ teacher_id: number }>();

      // "%_" はエスケープされなければ「任意の1文字+任意0文字以上」にマッチしてしまい、
      // 無関係な既存の教員名（例: 山田先生の"田先"部分）まで拾ってしまう
      const result = await repo.findAll({ userName: '%_off' });

      expect(result.items.map(t => t.teacher_id)).toEqual([
        wildcardTeacher!.teacher_id,
      ]);
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

    it('デフォルトでは有効・無効を問わず教員を返す', async () => {
      const target = seeded.teachers[0];
      await repo.deactivate(target.teacherId);

      const all = await repo.findAll();
      const active = await repo.findAll({ isLiveActive: true });
      const inactive = await repo.findAll({ isLiveActive: false });

      expect(all.items.some(item => item.teacher_id === target.teacherId)).toBe(
        true
      );
      expect(all.total).toBe(seeded.teachers.length);
      expect(
        active.items.some(item => item.teacher_id === target.teacherId)
      ).toBe(false);
      expect(
        inactive.items.some(item => item.teacher_id === target.teacherId)
      ).toBe(true);
    });

    it('デフォルトは offset=0, limit=50 で返す', async () => {
      const result = await repo.findAll();
      expect(result.offset).toBe(0);
      expect(result.limit).toBe(50);
    });

    it('教員名・クラスコード・クラス名で検索できる', async () => {
      const byName = await repo.findAll({
        search: seeded.teachers[0].displayName,
      });
      const byCode = await repo.findAll({
        search: seeded.classRooms[0].classCode,
      });
      const byClassName = await repo.findAll({
        search: seeded.classRooms[0].className,
      });

      expect(
        byName.items.some(
          item => item.teacher_id === seeded.teachers[0].teacherId
        )
      ).toBe(true);
      expect(
        byCode.items.some(
          item => item.teacher_id === seeded.teachers[0].teacherId
        )
      ).toBe(true);
      expect(
        byClassName.items.some(
          item => item.teacher_id === seeded.teachers[0].teacherId
        )
      ).toBe(true);
    });

    it('displayName と teacherId で安定ソートできる', async () => {
      const descending = await repo.findAll({
        sortBy: 'displayName',
        sortOrder: 'desc',
      });
      expect(descending.items.map(item => item.user_name)).toEqual(
        [...descending.items]
          .map(item => item.user_name)
          .sort()
          .reverse()
      );
    });

    it('classCode/className は担当クラスなしを常に末尾へ置く', async () => {
      for (const sortBy of ['classCode', 'className'] as const) {
        for (const sortOrder of ['asc', 'desc'] as const) {
          const result = await repo.findAll({ sortBy, sortOrder });
          expect(result.items.at(-1)?.class_rooms).toEqual([]);
          expect(result.items[0]?.teacher_id).toBe(
            seeded.teachers[0].teacherId
          );
        }
      }
    });

    it('isStaff で職員兼務の教員を絞り込める', async () => {
      await env.DB.prepare(
        'INSERT INTO staffs (user_id, created_at, updated_at) VALUES (?, ?, ?)'
      )
        .bind(
          seeded.teachers[0].userId,
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();

      const staffTeachers = await repo.findAll({ isStaff: true });
      const nonStaffTeachers = await repo.findAll({ isStaff: false });

      expect(staffTeachers.items.map(item => item.teacher_id)).toEqual([
        seeded.teachers[0].teacherId,
      ]);
      expect(nonStaffTeachers.items.map(item => item.teacher_id)).toEqual([
        seeded.teachers[1].teacherId,
      ]);
      expect(staffTeachers.items[0].is_staff).toBe(true);
      expect(nonStaffTeachers.items[0].is_staff).toBe(false);
    });

    it('limit/offset でページ分けできる', async () => {
      const page1 = await repo.findAll({ offset: 0, limit: 1 });
      const page2 = await repo.findAll({ offset: 1, limit: 1 });

      expect(page1.items).toHaveLength(1);
      expect(page2.items).toHaveLength(1);
      expect(page1.total).toBe(seeded.teachers.length);
      expect(page2.total).toBe(seeded.teachers.length);
      // 2ページで重複なく全件をカバーする
      expect(page1.items[0].teacher_id).not.toBe(page2.items[0].teacher_id);
    });

    it('存在しないoffsetの場合は空配列を返すが total は維持する', async () => {
      const result = await repo.findAll({ offset: 999, limit: 20 });
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
    it('氏名・担当クラスを更新し、有効状態は維持する', async () => {
      const target = seeded.teachers[1];
      const updated = await repo.update(target.teacherId, {
        userName: '更新済み先生',
        classRoomIds: [seeded.classRooms[1].classRoomId],
      });

      expect(updated).toMatchObject({
        teacher_id: target.teacherId,
        user_name: '更新済み先生',
        is_live_active: true,
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
        classRoomIds: [],
      });

      expect(updated?.class_rooms).toEqual([]);
    });

    it('存在しない教員IDの場合は null を返す', async () => {
      const updated = await repo.update(999999, {
        userName: 'x',
        classRoomIds: [],
      });
      expect(updated).toBeNull();
    });

    it('論理削除済み教員も更新できる', async () => {
      const target = seeded.teachers[0];
      await repo.deactivate(target.teacherId);

      const updated = await repo.update(target.teacherId, {
        userName: '更新不可先生',
        classRoomIds: [],
      });
      expect(updated).toMatchObject({
        teacher_id: target.teacherId,
        user_name: '更新不可先生',
        is_live_active: false,
      });
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
          classRoomIds: [999999],
        })
      ).rejects.toThrow();

      const refetched = await repo.findById(target.teacherId);
      expect(refetched?.user_name).toBe(beforeUserName);
      expect(refetched?.is_live_active).toBe(true);
      expect(refetched?.class_rooms).toEqual(beforeClassRooms);
    });
  });

  describe('deactivate', () => {
    it('教員を論理削除し、担当クラスを解除する', async () => {
      const target = seeded.teachers[0];
      expect(await repo.deactivate(target.teacherId)).toBe(true);

      const teacher = await repo.findById(target.teacherId);
      expect(teacher).toMatchObject({
        teacher_id: target.teacherId,
        is_live_active: false,
      });
      expect(teacher?.class_rooms).toEqual([]);
      const user = await env.DB.prepare(
        'SELECT is_live_active FROM users WHERE user_id = ?'
      )
        .bind(target.userId)
        .first<{ is_live_active: number }>();
      expect(user?.is_live_active).toBe(0);
    });

    it('削除済み教員を再度論理削除しても成功する', async () => {
      const target = seeded.teachers[1];
      expect(await repo.deactivate(target.teacherId)).toBe(true);
      expect(await repo.deactivate(target.teacherId)).toBe(true);
      expect(await repo.findById(target.teacherId)).not.toBeNull();
    });

    it('存在しない教員IDの場合は false を返す', async () => {
      expect(await repo.deactivate(999999)).toBe(false);
    });
  });

  describe('create', () => {
    it('教官を作成し、作成したエンティティを返す', async () => {
      const created = await repo.create({ displayName: '新規教官' });

      expect(created).toMatchObject({
        user_name: '新規教官',
        is_live_active: true,
        class_rooms: [],
      });
      expect(created.teacher_id).toEqual(expect.any(Number));
      expect(created.user_id).toEqual(expect.any(Number));
    });

    it('指定したクラスを担当として作成する', async () => {
      const classRoomId = seeded.classRooms[1].classRoomId;
      const created = await repo.create({
        userName: 'クラス担当教官',
        classRoomIds: [classRoomId],
      });

      expect(created.class_rooms).toEqual([
        expect.objectContaining({ class_room_id: classRoomId }),
      ]);
      expect((await repo.findById(created.teacher_id))?.class_rooms).toEqual(
        created.class_rooms
      );
    });

    it('複数のクラスを担当として作成する', async () => {
      // 1クラスだけの場合、IN句のプレースホルダーは '?' 一つで済むため
      // カンマ連結が正しいかを検証できない。複数指定してその経路を通す。
      const classRoomIds = seeded.classRooms.map(c => c.classRoomId);
      expect(classRoomIds.length).toBeGreaterThan(1);

      const created = await repo.create({
        userName: '複数クラス担当教官',
        classRoomIds,
      });

      // 担当クラスの取得順は保証されないため、IDを昇順に揃えて比較する
      const sortIds = (ids: number[]) => [...ids].sort((a, b) => a - b);
      const assignedIds = sortIds(
        created.class_rooms.map(c => c.class_room_id)
      );
      expect(assignedIds).toEqual(sortIds(classRoomIds));

      const reloaded = await repo.findById(created.teacher_id);
      expect(
        sortIds(reloaded?.class_rooms.map(c => c.class_room_id) ?? [])
      ).toEqual(assignedIds);
    });

    it('存在しないクラスを含む場合は教員・クラス紐付けを作成しない', async () => {
      const userName = '作成されない教官';
      const targetClassRoomId = seeded.classRooms[1].classRoomId;
      const beforeUser = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM users WHERE user_name = ?'
      )
        .bind(userName)
        .first<{ count: number }>();

      await expect(
        repo.create({
          userName,
          classRoomIds: [targetClassRoomId, 999999],
        })
      ).rejects.toThrow('Class room not found');

      const afterUser = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM users WHERE user_name = ?'
      )
        .bind(userName)
        .first<{ count: number }>();
      const classRoom = await env.DB.prepare(
        'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(targetClassRoomId)
        .first<{ teacher_id: number | null }>();

      expect(afterUser?.count).toBe(beforeUser?.count);
      expect(classRoom?.teacher_id).toBeNull();
    });
  });

  describe('createMany', () => {
    it('複数の教官をまとめて作成する', async () => {
      await repo.createMany([
        { displayName: '一括教官A' },
        { displayName: '一括教官B' },
      ]);

      const result = await repo.findAll({ userName: '一括教官' });
      expect(result.items.map(t => t.user_name).sort()).toEqual([
        '一括教官A',
        '一括教官B',
      ]);
    });

    it('空配列の場合は何も作成しない', async () => {
      const before = (await repo.findAll()).total;
      await repo.createMany([]);
      const after = (await repo.findAll()).total;
      expect(after).toBe(before);
    });

    it('2,000件の教官をまとめて作成できる', async () => {
      const inputs = Array.from({ length: 2000 }, (_, i) => ({
        displayName: `一括教官BULK2K${i}`,
      }));

      await repo.createMany(inputs);

      const result = await repo.findAll({ userName: '一括教官BULK2K' });
      expect(result.total).toBe(2000);
    });

    it('[REPRO #215] 後片付け(deleteUsersByIds)自体が失敗すると元のエラーが握りつぶされる', async () => {
      const originalPrepare = env.DB.prepare.bind(env.DB);
      const prepareSpy = vi
        .spyOn(env.DB, 'prepare')
        .mockImplementation((sql: string) => {
          if (sql.startsWith('INSERT INTO teachers')) {
            throw new Error('TEACHERS_INSERT_FAILED');
          }
          if (sql.startsWith('DELETE FROM users')) {
            throw new Error('DELETE_USERS_FAILED');
          }
          return originalPrepare(sql);
        });

      let thrown: unknown;
      try {
        await repo.createMany([{ displayName: '再現用教官' }]);
      } catch (error) {
        thrown = error;
      }

      prepareSpy.mockRestore();

      // 期待する挙動: deleteUsersByIds が失敗しても、元の teachers INSERT
      // 失敗のエラーが握りつぶされずに伝播すること
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).not.toBe('DELETE_USERS_FAILED');
      expect((thrown as Error).message).toBe('TEACHERS_INSERT_FAILED');

      // 後片付け: 次のテストに影響しないよう掃除しておく
      await env.DB.prepare('DELETE FROM users WHERE user_name = ?')
        .bind('再現用教官')
        .run();
    });
  });
});
