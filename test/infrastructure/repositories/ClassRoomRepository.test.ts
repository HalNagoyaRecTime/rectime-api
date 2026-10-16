import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClassRoomRepository } from '../../../src/infrastructure/repositories/ClassRoomRepository';
import { createUserStatusRepository } from '../../../src/infrastructure/repositories/UserStatusRepository';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';
import * as schema from '../../../src/infrastructure/database/schema';
import {
  class_rooms,
  students,
  teachers,
  users,
} from '../../../src/infrastructure/database/schema';

describe('ClassRoomRepository', () => {
  let repo: IClassRoomRepository;

  beforeAll(async () => {
    const orm = drizzle(env.DB, { schema });
    // class_rooms は students から、students は users から参照されるため、
    // 参照される側を残したまま削除するとFK制約に違反する。子テーブルから順に削除する
    // （テストはストレージを他ファイルと共有するため、他ファイルが投入した行が残っている場合がある）
    await env.DB.prepare('DELETE FROM gathering_group_members').run();
    await env.DB.prepare('DELETE FROM notification_schedules').run();
    await env.DB.prepare('DELETE FROM gatherings').run();
    await env.DB.prepare('DELETE FROM events').run();
    await orm.delete(students);
    await orm.delete(teachers);
    await orm.delete(users);
    await orm.delete(class_rooms);
    const [teacherUser] = await orm
      .insert(users)
      .values({ userName: '担任教員' })
      .returning();
    const [teacher] = await orm
      .insert(teachers)
      .values({ userId: teacherUser.id, email: 'tannin@example.ac.jp' })
      .returning();
    const classrooms = await orm
      .insert(class_rooms)
      .values([
        { classCode: '12B', name: '2年Bクラス', teacherId: teacher.id },
        { classCode: 'IA14A', name: '高度情報学科AI開発先行コース' },
      ])
      .returning();
    const [studentUser] = await orm
      .insert(users)
      .values({ userName: '所属学生' })
      .returning();
    await orm.insert(students).values({
      userId: studentUser.id,
      classRoomId: classrooms[0].id,
      attendanceNumber: 1,
      studentIdNumber: 'CLASS-TEST-001',
    });

    repo = createClassRoomRepository(env.DB);
  });

  describe('findAll', () => {
    it('class_rooms を class_room_id 昇順で返し、limitとoffsetを適用する', async () => {
      const result = await repo.findAll({ limit: 1, offset: 1 });

      expect(result.items).toHaveLength(1);
      expect(result).toMatchObject({ total: 2, limit: 1, offset: 1 });
      expect(result.items[0].classCode).toBe('IA14A');
      const ids = result.items.map(c => c.classRoomId);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('学生数と担任をClassEntityへマッピングする', async () => {
      const result = await repo.findAll({ limit: 20, offset: 0 });

      expect(result.items[0]).toMatchObject({
        classCode: '12B',
        className: '2年Bクラス',
        studentCount: 1,
        teacher: { displayName: '担任教員' },
      });
      expect(result.items[1]).toMatchObject({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        studentCount: 0,
        teacher: null,
      });
    });

    it('class_room_idを検索できる', async () => {
      const all = await repo.findAll({ limit: 20, offset: 0 });
      const target = all.items[0];

      const result = await repo.findAll({
        limit: 20,
        offset: 0,
        search: String(target.classRoomId),
      });

      expect(result.items.map(classroom => classroom.classRoomId)).toContain(
        target.classRoomId
      );
    });

    it('クラスコード・クラス名・担任名を検索できる', async () => {
      await expect(repo.findAll({ search: '12B' })).resolves.toMatchObject({
        items: [expect.objectContaining({ classCode: '12B' })],
      });
      await expect(
        repo.findAll({ search: '高度情報学科' })
      ).resolves.toMatchObject({
        items: [expect.objectContaining({ classCode: 'IA14A' })],
      });
      await expect(repo.findAll({ search: '担任教員' })).resolves.toMatchObject(
        {
          items: [expect.objectContaining({ classCode: '12B' })],
        }
      );
    });

    it.each([
      'classRoomId',
      'classCode',
      'className',
      'teacherName',
      'studentCount',
    ] as const)(
      '%sの昇順・降順とIDによる安定ソートを適用する',
      async sortBy => {
        if (sortBy === 'className') {
          await repo.create({
            classCode: 'SORT-TIE-A',
            className: '同名クラス',
            teacherId: null,
          });
          await repo.create({
            classCode: 'SORT-TIE-B',
            className: '同名クラス',
            teacherId: null,
          });
        }

        const ascItems = (
          await repo.findAll({ sortBy, sortOrder: 'asc', limit: 100 })
        ).items;
        const descItems = (
          await repo.findAll({ sortBy, sortOrder: 'desc', limit: 100 })
        ).items;
        const value = (item: (typeof ascItems)[number]) => {
          if (sortBy === 'classRoomId') return item.classRoomId;
          if (sortBy === 'classCode') return item.classCode;
          if (sortBy === 'className') return item.className;
          if (sortBy === 'studentCount') return item.studentCount;
          return item.teacher?.displayName ?? null;
        };
        const assertOrdered = (
          items: typeof ascItems,
          direction: 'asc' | 'desc'
        ) => {
          for (let index = 1; index < items.length; index += 1) {
            const previous = value(items[index - 1]);
            const current = value(items[index]);
            if (previous === null || current === null) continue;
            if (previous === current) {
              expect(items[index - 1].classRoomId).toBeLessThan(
                items[index].classRoomId
              );
              continue;
            }
            if (direction === 'asc') {
              expect(previous <= current).toBe(true);
            } else {
              expect(previous >= current).toBe(true);
            }
          }
        };

        assertOrdered(ascItems, 'asc');
        assertOrdered(descItems, 'desc');
      }
    );
  });

  it('詳細を取得できる', async () => {
    const classroom = (await repo.findAll({ limit: 1, offset: 0 })).items[0];

    await expect(repo.findById(classroom.classRoomId)).resolves.toMatchObject({
      classCode: '12B',
      studentCount: 1,
    });
    await expect(repo.findById(999999)).resolves.toBeNull();
  });

  it('class_rooms.updated_at を updatedAt として一覧・詳細の両方で返す', async () => {
    const classroom = (await repo.findAll({ limit: 1, offset: 0 })).items[0];
    const row = await env.DB.prepare(
      'SELECT updated_at FROM class_rooms WHERE class_room_id = ?'
    )
      .bind(classroom.classRoomId)
      .first<{ updated_at: string }>();

    expect(classroom.updatedAt).toBe(row?.updated_at);
    expect(classroom.lockVersion).toBe(0);
    await expect(repo.findById(classroom.classRoomId)).resolves.toMatchObject({
      updatedAt: row?.updated_at,
    });
  });

  it('担任未設定のクラスを作成・更新・削除できる', async () => {
    const created = await repo.create({
      classCode: '13A',
      className: '3年Aクラス',
      teacherId: null,
    });
    expect(created).toMatchObject({
      classCode: '13A',
      className: '3年Aクラス',
      studentCount: 0,
      teacher: null,
    });

    const updated = await repo.update(created.classRoomId, {
      classCode: '13B',
      className: '3年Bクラス',
      teacherId: null,
    });
    expect(updated).toMatchObject({
      classCode: '13B',
      className: '3年Bクラス',
    });
    await expect(repo.delete(created.classRoomId)).resolves.toBe(true);
    await expect(repo.findById(created.classRoomId)).resolves.toBeNull();
  });

  it('class_codeの一意制約を適用する', async () => {
    await expect(
      repo.create({
        classCode: 'IA14A',
        className: '重複クラス',
        teacherId: null,
      })
    ).rejects.toThrow(/UNIQUE/);
  });

  it('class_codeの一意制約を更新にも適用する', async () => {
    const target = await repo.findByCode('12B');
    expect(target).not.toBeNull();

    await expect(
      repo.update(target!.classRoomId, {
        classCode: 'IA14A',
        className: '重複クラス',
        teacherId: null,
      })
    ).rejects.toThrow(/UNIQUE/);

    await expect(repo.findByCode('12B')).resolves.toMatchObject({
      className: '2年Bクラス',
    });
  });

  it('学生の所属有無を返す', async () => {
    const classrooms = (await repo.findAll({ limit: 20, offset: 0 })).items;
    const assigned = classrooms.find(c => c.classCode === '12B');
    const unassigned = classrooms.find(c => c.classCode === 'IA14A');

    await expect(repo.hasStudents(assigned!.classRoomId)).resolves.toBe(true);
    await expect(repo.hasStudents(unassigned!.classRoomId)).resolves.toBe(
      false
    );
  });

  describe('findByCode', () => {
    it('class_codeでクラスを取得できる', async () => {
      await expect(repo.findByCode('IA14A')).resolves.toMatchObject({
        classCode: 'IA14A',
      });
    });

    it('存在しないclass_codeの場合はnullを返す', async () => {
      await expect(repo.findByCode('NOPE')).resolves.toBeNull();
    });
  });

  describe('findExistingClassCodes', () => {
    it('2,000件の候補から、DBに実在するクラスコードだけをチャンク境界をまたいでもまとめて返す', async () => {
      const candidates = Array.from(
        { length: 2000 },
        (_, i) => `Z${String(i).padStart(4, '0')}`
      );
      candidates[0] = '12B';
      candidates[150] = 'IA14A';

      const existing = await repo.findExistingClassCodes(candidates);

      expect(existing).toEqual(new Set(['12B', 'IA14A']));
    });

    it('候補が空配列の場合は空集合を返す', async () => {
      expect(await repo.findExistingClassCodes([])).toEqual(new Set());
    });
  });

  describe('findExistingClassRoomIds', () => {
    it('候補からDBに実在するクラスIDだけを返す', async () => {
      const ids = (await repo.findAll({ limit: 20, offset: 0 })).items.map(
        classroom => classroom.classRoomId
      );
      const candidates = Array.from(
        { length: 2000 },
        (_, index) => index + 1000
      );
      candidates[0] = ids[0];
      candidates[150] = ids[1];

      await expect(repo.findExistingClassRoomIds(candidates)).resolves.toEqual(
        new Set([ids[0], ids[1]])
      );
    });

    it('候補が空配列の場合は空集合を返す', async () => {
      await expect(repo.findExistingClassRoomIds([])).resolves.toEqual(
        new Set()
      );
    });
  });

  describe('createMany', () => {
    it('複数のクラスをまとめて作成する', async () => {
      await repo.createMany([
        { classCode: '14D', className: '4年Dクラス', teacherId: null },
        { classCode: '14E', className: '4年Eクラス', teacherId: null },
      ]);

      await expect(repo.findByCode('14D')).resolves.toMatchObject({
        className: '4年Dクラス',
      });
      await expect(repo.findByCode('14E')).resolves.toMatchObject({
        className: '4年Eクラス',
      });
    });

    it('空配列の場合は何も作成しない', async () => {
      const before = (await repo.findAll({ limit: 100, offset: 0 })).total;
      await repo.createMany([]);
      const after = (await repo.findAll({ limit: 100, offset: 0 })).total;
      expect(after).toBe(before);
    });

    it('class_codeが重複する行がある場合は1件も登録しない', async () => {
      await expect(
        repo.createMany([
          { classCode: '15A', className: '5年Aクラス', teacherId: null },
          { classCode: 'IA14A', className: '重複クラス', teacherId: null },
        ])
      ).rejects.toThrow();

      await expect(repo.findByCode('15A')).resolves.toBeNull();
    });

    it('後続チャンクの重複エラーでも先行チャンクを残さない', async () => {
      const inputs = Array.from({ length: 34 }, (_, index) => ({
        classCode: `ATOMIC-${index}`,
        className: `原子性テスト${index}`,
        teacherId: null,
      }));
      inputs[33] = {
        classCode: 'IA14A',
        className: '重複クラス',
        teacherId: null,
      };

      await expect(repo.createMany(inputs)).rejects.toThrow();
      await expect(repo.findByCode('ATOMIC-0')).resolves.toBeNull();
    });

    it('2,000件のクラスをまとめて作成できる', async () => {
      const inputs = Array.from({ length: 2000 }, (_, i) => ({
        classCode: `BULK2K-${i}`,
        className: `一括クラス${i}`,
        teacherId: null,
      }));

      await repo.createMany(inputs);

      await expect(repo.findByCode('BULK2K-0')).resolves.toMatchObject({
        className: '一括クラス0',
      });
      await expect(repo.findByCode('BULK2K-1999')).resolves.toMatchObject({
        className: '一括クラス1999',
      });
    });
  });

  describe('版番号による楽観ロック', () => {
    async function createClass(classCode: string) {
      const created = await repo.create({
        classCode,
        className: '版番号テスト',
        teacherId: null,
      });
      return created.classRoomId;
    }

    const input = (classCode: string, className: string) => ({
      classCode,
      className,
      teacherId: null,
    });

    it('expectedLockVersion が現在の値と一致すれば更新し、lockVersion を1増やす', async () => {
      const id = await createClass('LOCK-1');

      const updated = await repo.update(id, {
        ...input('LOCK-1', '更新後'),
        expectedLockVersion: 0,
      });

      expect(updated).toMatchObject({ className: '更新後', lockVersion: 1 });
    });

    it('expectedLockVersion が現在の値と異なれば null を返し、何も変更しない', async () => {
      const id = await createClass('LOCK-2');

      const updated = await repo.update(id, {
        ...input('LOCK-2', '上書きされてはいけない'),
        expectedLockVersion: 5,
      });

      expect(updated).toBeNull();
      await expect(repo.findById(id)).resolves.toMatchObject({
        className: '版番号テスト',
        lockVersion: 0,
      });
    });

    it('同じ版番号での2回の連続更新は、1回目だけ成功し2回目は競合する（同じ秒内でも）', async () => {
      const id = await createClass('LOCK-3');

      const first = await repo.update(id, {
        ...input('LOCK-3', 'Aの更新'),
        expectedLockVersion: 0,
      });
      const second = await repo.update(id, {
        ...input('LOCK-3', 'Bの更新'),
        expectedLockVersion: 0,
      });

      expect(first).toMatchObject({ className: 'Aの更新', lockVersion: 1 });
      expect(second).toBeNull();
      await expect(repo.findById(id)).resolves.toMatchObject({
        className: 'Aの更新',
      });
    });

    it('expectedLockVersion を指定しない更新は版番号を確認せず、lockVersion は進む', async () => {
      const id = await createClass('LOCK-4');

      const updated = await repo.update(id, input('LOCK-4', '更新後'));

      expect(updated).toMatchObject({ className: '更新後', lockVersion: 1 });
    });
  });

  describe('担任の付け替えと教員の lockVersion', () => {
    async function insertTeacher(name: string) {
      const user = await env.DB.prepare(
        'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
      )
        .bind(name)
        .first<{ user_id: number }>();
      const teacher = await env.DB.prepare(
        'INSERT INTO teachers (user_id, email) VALUES (?, ?) RETURNING teacher_id'
      )
        .bind(user!.user_id, `${name}@example.ac.jp`)
        .first<{ teacher_id: number }>();
      return teacher!.teacher_id;
    }

    async function readTeacherLock(teacherId: number) {
      const row = await env.DB.prepare(
        'SELECT lock_version FROM teachers WHERE teacher_id = ?'
      )
        .bind(teacherId)
        .first<{ lock_version: number }>();
      return row?.lock_version;
    }

    it('担任を付け替えると、旧担任と新担任の lock_version が1ずつ進む', async () => {
      const oldTeacher = await insertTeacher('付替旧担任');
      const newTeacher = await insertTeacher('付替新担任');
      const created = await repo.create({
        classCode: 'SW-1',
        className: '付け替え',
        teacherId: oldTeacher,
      });
      // 担任付きの作成で、担任の版番号が進んでいる
      expect(await readTeacherLock(oldTeacher)).toBe(1);

      await repo.update(created.classRoomId, {
        classCode: 'SW-1',
        className: '付け替え',
        teacherId: newTeacher,
      });

      expect(await readTeacherLock(oldTeacher)).toBe(2);
      expect(await readTeacherLock(newTeacher)).toBe(1);
    });

    it('担任が変わらない更新（クラス名だけの変更）では、担任の lock_version は進まない', async () => {
      const teacher = await insertTeacher('据置担任');
      const created = await repo.create({
        classCode: 'SW-2',
        className: '据え置き',
        teacherId: teacher,
      });
      const before = await readTeacherLock(teacher);

      await repo.update(created.classRoomId, {
        classCode: 'SW-2',
        className: '据え置き（改称）',
        teacherId: teacher,
      });

      expect(await readTeacherLock(teacher)).toBe(before);
    });

    it('版番号の不一致で更新されなかった場合は、担任の lock_version を進めない', async () => {
      const oldTeacher = await insertTeacher('不一致旧担任');
      const newTeacher = await insertTeacher('不一致新担任');
      const created = await repo.create({
        classCode: 'SW-3',
        className: '不一致',
        teacherId: oldTeacher,
      });
      const oldBefore = await readTeacherLock(oldTeacher);

      const updated = await repo.update(created.classRoomId, {
        classCode: 'SW-3',
        className: '不一致',
        teacherId: newTeacher,
        expectedLockVersion: 99,
      });

      expect(updated).toBeNull();
      expect(await readTeacherLock(oldTeacher)).toBe(oldBefore);
      expect(await readTeacherLock(newTeacher)).toBe(0);
    });

    it('担任を外す更新では、旧担任の lock_version が進む', async () => {
      const teacher = await insertTeacher('解除担任');
      const created = await repo.create({
        classCode: 'SW-4',
        className: '解除',
        teacherId: teacher,
      });
      const before = await readTeacherLock(teacher);

      await repo.update(created.classRoomId, {
        classCode: 'SW-4',
        className: '解除',
        teacherId: null,
      });

      expect(await readTeacherLock(teacher)).toBe(before! + 1);
    });

    it('createMany で担任を指定したクラスを作成すると、担任の lock_version が進む', async () => {
      const teacher = await insertTeacher('一括担任');

      await repo.createMany([
        { classCode: 'SW-5A', className: '一括A', teacherId: teacher },
        { classCode: 'SW-5B', className: '一括B', teacherId: teacher },
        { classCode: 'SW-5C', className: '一括C', teacherId: null },
      ]);

      expect(await readTeacherLock(teacher)).toBe(1);
    });
  });

  describe('担任の稼働状態', () => {
    it('無効化された教員は担任として返さないが、割り当ては残り再有効化で戻る', async () => {
      const target = (await repo.findAll({ limit: 100, offset: 0 })).items.find(
        c => c.classCode === '12B'
      );

      await env.DB.prepare(
        "UPDATE users SET is_live_active = 0 WHERE user_name = '担任教員'"
      ).run();

      await expect(repo.findById(target!.classRoomId)).resolves.toMatchObject({
        teacher: null,
      });

      // 表示から外れるだけで、担任の割り当て自体は残っている
      const row = await env.DB.prepare(
        'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(target!.classRoomId)
        .first<{ teacher_id: number | null }>();
      expect(row?.teacher_id).not.toBeNull();

      await env.DB.prepare(
        "UPDATE users SET is_live_active = 1 WHERE user_name = '担任教員'"
      ).run();

      await expect(repo.findById(target!.classRoomId)).resolves.toMatchObject({
        teacher: { displayName: '担任教員' },
      });
    });

    it('停止中の担任がいるクラスをクラス名だけ変更しても、再有効化で担任に戻る', async () => {
      const target = (await repo.findAll({ limit: 100, offset: 0 })).items.find(
        c => c.classCode === '12B'
      );

      await env.DB.prepare(
        "UPDATE users SET is_live_active = 0 WHERE user_name = '担任教員'"
      ).run();

      // 管理画面は担任なしとして受け取った教室をそのまま送り返すため、
      // クラス名だけを変えた保存でも teacherId は null で届く
      const updated = await repo.update(target!.classRoomId, {
        classCode: '12B',
        className: '2年Bクラス（改称）',
        teacherId: null,
      });
      expect(updated).toMatchObject({
        className: '2年Bクラス（改称）',
        teacher: null,
      });

      await env.DB.prepare(
        "UPDATE users SET is_live_active = 1 WHERE user_name = '担任教員'"
      ).run();

      await expect(repo.findById(target!.classRoomId)).resolves.toMatchObject({
        className: '2年Bクラス（改称）',
        teacher: { displayName: '担任教員' },
      });
    });

    it('取得後に停止中の担任が再有効化されていた場合、更新時刻付きの更新は0件更新になり担任の割り当ては残る', async () => {
      const target = (await repo.findAll({ limit: 100, offset: 0 })).items.find(
        c => c.classCode === '12B'
      );
      await env.DB.prepare(
        "UPDATE users SET is_live_active = 0 WHERE user_name = '担任教員'"
      ).run();
      // 管理画面が取得した時点の教室。担任は停止中のため null で返る
      const fetched = await repo.findById(target!.classRoomId);
      expect(fetched?.teacher).toBeNull();
      const teacherUser = await env.DB.prepare(
        "SELECT user_id FROM users WHERE user_name = '担任教員'"
      ).first<{ user_id: number }>();

      // 取得後に、別の操作で担任が再有効化される
      await createUserStatusRepository(env.DB).updateLiveActive(
        teacherUser!.user_id,
        true
      );

      const updated = await repo.update(target!.classRoomId, {
        classCode: '12B',
        className: '上書きされてはいけない',
        teacherId: null,
        expectedLockVersion: fetched!.lockVersion,
      });

      expect(updated).toBeNull();
      await expect(repo.findById(target!.classRoomId)).resolves.toMatchObject({
        className: fetched!.className,
        teacher: { displayName: '担任教員' },
      });
    });

    it('稼働中の担任はteacherId: nullで外せる', async () => {
      const target = (await repo.findAll({ limit: 100, offset: 0 })).items.find(
        c => c.classCode === '12B'
      );

      const updated = await repo.update(target!.classRoomId, {
        classCode: '12B',
        className: '2年Bクラス',
        teacherId: null,
      });

      expect(updated).toMatchObject({ teacher: null });
      const row = await env.DB.prepare(
        'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(target!.classRoomId)
        .first<{ teacher_id: number | null }>();
      expect(row?.teacher_id).toBeNull();
    });
  });
});
