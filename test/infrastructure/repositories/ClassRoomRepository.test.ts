import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClassRoomRepository } from '../../../src/infrastructure/repositories/ClassRoomRepository';
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
      .values({ userId: teacherUser.id })
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
});
