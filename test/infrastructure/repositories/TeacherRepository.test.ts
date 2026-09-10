import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTeacherRepository } from '../../../src/infrastructure/repositories/TeacherRepository';
import { createUserStatusRepository } from '../../../src/infrastructure/repositories/UserStatusRepository';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';
import {
  seedStaffsTeachers,
  type SeededData,
} from '../../fixtures/staffsTeachers';

// User の無効化は PATCH /api/v1/admin/users/:userId が使う UserStatusRepository で行う。
// テスト用の直接SQLではなく実運用と同じ経路を通すことで、
// この経路が Teacher 固有データ・所属情報に影響しないことを検証できる。
async function deactivateUser(userId: number): Promise<void> {
  await createUserStatusRepository(env.DB).updateLiveActive(userId, false);
}

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
      const names = result.items.map(t => t.userName).sort();
      const expected = seeded.teachers.map(t => t.displayName).sort();
      expect(names).toEqual(expected);
    });

    it('担当クラスを含めて返す', async () => {
      const result = await repo.findAll();
      const assigned = result.items.find(
        t => t.teacherId === seeded.teachers[0].teacherId
      );
      const unassigned = result.items.find(
        t => t.teacherId === seeded.teachers[1].teacherId
      );

      expect(assigned?.classRooms).toEqual([
        {
          classRoomId: seeded.classRooms[0].classRoomId,
          classCode: seeded.classRooms[0].classCode,
          className: seeded.classRooms[0].className,
        },
      ]);
      expect(unassigned?.classRooms).toEqual([]);
    });

    it('search に % や _ が含まれる場合、ワイルドカードとしてではなく文字通り一致で絞り込む', async () => {
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
      const result = await repo.findAll({ search: '%_off' });

      expect(result.items.map(t => t.teacherId)).toEqual([
        wildcardTeacher!.teacher_id,
      ]);
    });

    it('classRoomId で絞り込める', async () => {
      const result = await repo.findAll({
        classRoomId: seeded.classRooms[0].classRoomId,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].teacherId).toBe(seeded.teachers[0].teacherId);
      expect(result.total).toBe(1);
    });

    it('isLiveActive で絞り込める', async () => {
      const result = await repo.findAll({ isLiveActive: true });
      expect(result.items).toHaveLength(seeded.teachers.length);
    });

    it('デフォルトでは有効・無効を問わず教員を返す', async () => {
      const target = seeded.teachers[0];
      await deactivateUser(target.userId);

      const all = await repo.findAll();
      const active = await repo.findAll({ isLiveActive: true });
      const inactive = await repo.findAll({ isLiveActive: false });

      expect(all.items.some(item => item.teacherId === target.teacherId)).toBe(
        true
      );
      expect(all.total).toBe(seeded.teachers.length);
      expect(
        active.items.some(item => item.teacherId === target.teacherId)
      ).toBe(false);
      expect(
        inactive.items.some(item => item.teacherId === target.teacherId)
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
          item => item.teacherId === seeded.teachers[0].teacherId
        )
      ).toBe(true);
      expect(
        byCode.items.some(
          item => item.teacherId === seeded.teachers[0].teacherId
        )
      ).toBe(true);
      expect(
        byClassName.items.some(
          item => item.teacherId === seeded.teachers[0].teacherId
        )
      ).toBe(true);
    });

    it('displayName と teacherId で安定ソートできる', async () => {
      const descending = await repo.findAll({
        sortBy: 'displayName',
        sortOrder: 'desc',
      });
      expect(descending.items.map(item => item.userName)).toEqual(
        [...descending.items]
          .map(item => item.userName)
          .sort()
          .reverse()
      );
    });

    it('classCode/className は担当クラスなしを常に末尾へ置く', async () => {
      for (const sortBy of ['classCode', 'className'] as const) {
        for (const sortOrder of ['asc', 'desc'] as const) {
          const result = await repo.findAll({ sortBy, sortOrder });
          expect(result.items.at(-1)?.classRooms).toEqual([]);
          expect(result.items[0]?.teacherId).toBe(seeded.teachers[0].teacherId);
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

      expect(staffTeachers.items.map(item => item.teacherId)).toEqual([
        seeded.teachers[0].teacherId,
      ]);
      expect(nonStaffTeachers.items.map(item => item.teacherId)).toEqual([
        seeded.teachers[1].teacherId,
      ]);
      expect(staffTeachers.items[0].isStaff).toBe(true);
      expect(nonStaffTeachers.items[0].isStaff).toBe(false);
    });

    it('isStaff と isLiveActive でソートでき、同値時はteacherId昇順になる', async () => {
      const initiallySortedByStaff = await repo.findAll({
        sortBy: 'isStaff',
        sortOrder: 'asc',
      });
      expect(initiallySortedByStaff.items.map(item => item.teacherId)).toEqual(
        seeded.teachers.map(teacher => teacher.teacherId)
      );

      const now = new Date().toISOString();
      await env.DB.prepare(
        'INSERT INTO staffs (user_id, created_at, updated_at) VALUES (?, ?, ?)'
      )
        .bind(seeded.teachers[0].userId, now, now)
        .run();

      const staffAsc = await repo.findAll({
        sortBy: 'isStaff',
        sortOrder: 'asc',
      });
      const staffDesc = await repo.findAll({
        sortBy: 'isStaff',
        sortOrder: 'desc',
      });
      expect(staffAsc.items.map(item => item.teacherId)).toEqual([
        seeded.teachers[1].teacherId,
        seeded.teachers[0].teacherId,
      ]);
      expect(staffDesc.items.map(item => item.teacherId)).toEqual([
        seeded.teachers[0].teacherId,
        seeded.teachers[1].teacherId,
      ]);

      const initiallySortedByActive = await repo.findAll({
        sortBy: 'isLiveActive',
        sortOrder: 'desc',
      });
      expect(initiallySortedByActive.items.map(item => item.teacherId)).toEqual(
        seeded.teachers.map(teacher => teacher.teacherId)
      );

      await deactivateUser(seeded.teachers[1].userId);

      const activeAsc = await repo.findAll({
        sortBy: 'isLiveActive',
        sortOrder: 'asc',
      });
      const activeDesc = await repo.findAll({
        sortBy: 'isLiveActive',
        sortOrder: 'desc',
      });
      expect(activeAsc.items.map(item => item.teacherId)).toEqual([
        seeded.teachers[1].teacherId,
        seeded.teachers[0].teacherId,
      ]);
      expect(activeDesc.items.map(item => item.teacherId)).toEqual([
        seeded.teachers[0].teacherId,
        seeded.teachers[1].teacherId,
      ]);
    });

    it('limit/offset でページ分けできる', async () => {
      const page1 = await repo.findAll({ offset: 0, limit: 1 });
      const page2 = await repo.findAll({ offset: 1, limit: 1 });

      expect(page1.items).toHaveLength(1);
      expect(page2.items).toHaveLength(1);
      expect(page1.total).toBe(seeded.teachers.length);
      expect(page2.total).toBe(seeded.teachers.length);
      // 2ページで重複なく全件をカバーする
      expect(page1.items[0].teacherId).not.toBe(page2.items[0].teacherId);
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
        teacherId: target.teacherId,
        userId: target.userId,
        userName: target.displayName,
        isLiveActive: true,
      });
      expect(teacher?.classRooms).toEqual([
        {
          classRoomId: seeded.classRooms[0].classRoomId,
          classCode: seeded.classRooms[0].classCode,
          className: seeded.classRooms[0].className,
        },
      ]);
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });

  describe('existsById', () => {
    it('存在する教員の場合は true を返す', async () => {
      expect(await repo.existsById(seeded.teachers[0].teacherId)).toBe(true);
    });

    it('存在しない教員の場合は false を返す', async () => {
      expect(await repo.existsById(999999)).toBe(false);
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
        teacherId: target.teacherId,
        userName: '更新済み先生',
        isLiveActive: true,
      });
      expect(updated?.classRooms).toEqual([
        {
          classRoomId: seeded.classRooms[1].classRoomId,
          classCode: seeded.classRooms[1].classCode,
          className: seeded.classRooms[1].className,
        },
      ]);

      const refetched = await repo.findById(target.teacherId);
      expect(refetched?.classRooms).toEqual(updated?.classRooms);
    });

    it('担当クラスを空にできる', async () => {
      const target = seeded.teachers[0];
      const updated = await repo.update(target.teacherId, {
        userName: target.displayName,
        classRoomIds: [],
      });

      expect(updated?.classRooms).toEqual([]);
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
      await deactivateUser(target.userId);

      const updated = await repo.update(target.teacherId, {
        userName: '更新不可先生',
        classRoomIds: [],
      });
      expect(updated).toMatchObject({
        teacherId: target.teacherId,
        userName: '更新不可先生',
        isLiveActive: false,
      });
    });

    it('存在しないクラスIDを含む場合は失敗し、氏名・有効状態・既存の担当クラスが変更前のまま残る（アトミック性）', async () => {
      const target = seeded.teachers[0];
      const beforeUserName = target.displayName;
      const beforeClassRooms = [
        {
          classRoomId: seeded.classRooms[0].classRoomId,
          classCode: seeded.classRooms[0].classCode,
          className: seeded.classRooms[0].className,
        },
      ];

      await expect(
        repo.update(target.teacherId, {
          userName: '更新失敗するはずの先生',
          classRoomIds: [999999],
        })
      ).rejects.toThrow();

      const refetched = await repo.findById(target.teacherId);
      expect(refetched?.userName).toBe(beforeUserName);
      expect(refetched?.isLiveActive).toBe(true);
      expect(refetched?.classRooms).toEqual(beforeClassRooms);
    });
  });

  describe('User の無効化', () => {
    it('User を無効化しても担当クラスの割り当てが保持される', async () => {
      const target = seeded.teachers[0];
      const assigned = seeded.classRooms[0];

      await deactivateUser(target.userId);

      const teacher = await repo.findById(target.teacherId);
      expect(teacher?.isLiveActive).toBe(false);
      expect(teacher?.classRooms).toEqual([
        {
          classRoomId: assigned.classRoomId,
          classCode: assigned.classCode,
          className: assigned.className,
        },
      ]);

      const classRoom = await env.DB.prepare(
        'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(assigned.classRoomId)
        .first<{ teacher_id: number | null }>();
      expect(classRoom?.teacher_id).toBe(target.teacherId);
    });
  });

  describe('create', () => {
    it('教官を作成し、作成したエンティティを返す', async () => {
      const created = await repo.create({ displayName: '新規教官' });

      expect(created).toMatchObject({
        userName: '新規教官',
        isLiveActive: true,
        classRooms: [],
      });
      expect(created.teacherId).toEqual(expect.any(Number));
      expect(created.userId).toEqual(expect.any(Number));
    });

    it('指定したクラスを担当として作成する', async () => {
      const classRoomId = seeded.classRooms[1].classRoomId;
      const created = await repo.create({
        userName: 'クラス担当教官',
        classRoomIds: [classRoomId],
      });

      expect(created.classRooms).toEqual([
        expect.objectContaining({ classRoomId }),
      ]);
      expect((await repo.findById(created.teacherId))?.classRooms).toEqual(
        created.classRooms
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
      const assignedIds = sortIds(created.classRooms.map(c => c.classRoomId));
      expect(assignedIds).toEqual(sortIds(classRoomIds));

      const reloaded = await repo.findById(created.teacherId);
      expect(
        sortIds(reloaded?.classRooms.map(c => c.classRoomId) ?? [])
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

      const result = await repo.findAll({ search: '一括教官' });
      expect(result.items.map(t => t.userName).sort()).toEqual([
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

      const result = await repo.findAll({ search: '一括教官BULK2K' });
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

  describe('deleteByUserId', () => {
    it('教員を物理削除し、担当クラスのteacher_idをNULL化する', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('削除対象教員') RETURNING user_id"
      ).first<{ user_id: number }>();
      const teacher = await env.DB.prepare(
        'INSERT INTO teachers (user_id) VALUES (?) RETURNING teacher_id'
      )
        .bind(user!.user_id)
        .first<{ teacher_id: number }>();
      const classRoom = await env.DB.prepare(
        "INSERT INTO class_rooms (class_code, class_name, teacher_id) VALUES ('DEL-1', '削除確認クラス', ?) RETURNING class_room_id"
      )
        .bind(teacher!.teacher_id)
        .first<{ class_room_id: number }>();

      await expect(repo.deleteByUserId(user!.user_id)).resolves.toBe(true);

      const teacherRow = await env.DB.prepare(
        'SELECT * FROM teachers WHERE teacher_id = ?'
      )
        .bind(teacher!.teacher_id)
        .first();
      expect(teacherRow).toBeNull();

      const classRoomRow = await env.DB.prepare(
        'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(classRoom!.class_room_id)
        .first<{ teacher_id: number | null }>();
      expect(classRoomRow?.teacher_id).toBeNull();
    });

    it('該当する教員が存在しない場合はfalseを返す(冪等)', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('非教員') RETURNING user_id"
      ).first<{ user_id: number }>();

      await expect(repo.deleteByUserId(user!.user_id)).resolves.toBe(false);
    });
  });
});
