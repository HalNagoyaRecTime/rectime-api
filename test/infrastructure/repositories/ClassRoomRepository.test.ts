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
import { insertClassRoomWithTeam } from '../../fixtures/classRooms';

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
    await env.DB.prepare('DELETE FROM teams').run();
    const [teacherUser] = await orm
      .insert(users)
      .values({ userName: '担任教員' })
      .returning();
    const [teacher] = await orm
      .insert(teachers)
      .values({ userId: teacherUser.id })
      .returning();
    const classroom1 = await insertClassRoomWithTeam(env.DB, {
      classCode: '12B',
      className: '2年Bクラス',
      teacherId: teacher.id,
    });
    await insertClassRoomWithTeam(env.DB, {
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
    });
    const [studentUser] = await orm
      .insert(users)
      .values({ userName: '所属学生' })
      .returning();
    await orm.insert(students).values({
      userId: studentUser.id,
      classRoomId: classroom1.classRoomId,
      attendanceNumber: 1,
      studentIdNumber: 'CLASS-TEST-001',
    });

    repo = createClassRoomRepository(env.DB);
  });

  describe('findAll', () => {
    it('class_rooms を class_room_id 昇順で返し、limitとoffsetを適用する', async () => {
      const result = await repo.findAll(1, 1);

      expect(result.classrooms).toHaveLength(1);
      expect(result).toMatchObject({ total: 2, limit: 1, offset: 1 });
      expect(result.classrooms[0].class_code).toBe('IA14A');
      const ids = result.classrooms.map(c => c.class_room_id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('学生数と担任をClassEntityへマッピングする', async () => {
      const result = await repo.findAll(20, 0);

      expect(result.classrooms[0]).toMatchObject({
        class_code: '12B',
        class_name: '2年Bクラス',
        student_count: 1,
        teacher: { display_name: '担任教員' },
      });
      expect(result.classrooms[1]).toMatchObject({
        class_code: 'IA14A',
        class_name: '高度情報学科AI開発先行コース',
        student_count: 0,
        teacher: null,
      });
    });
  });

  it('詳細を取得できる', async () => {
    const classroom = (await repo.findAll(1, 0)).classrooms[0];

    await expect(repo.findById(classroom.class_room_id)).resolves.toMatchObject(
      {
        class_code: '12B',
        student_count: 1,
      }
    );
    await expect(repo.findById(999999)).resolves.toBeNull();
  });

  it('担任未設定のクラスを作成・更新・削除できる', async () => {
    const created = await repo.create({
      class_code: '13A',
      class_name: '3年Aクラス',
      teacher_id: null,
    });
    expect(created).toMatchObject({
      class_code: '13A',
      class_name: '3年Aクラス',
      student_count: 0,
      teacher: null,
    });

    const updated = await repo.update(created.class_room_id, {
      class_code: '13B',
      class_name: '3年Bクラス',
      teacher_id: null,
    });
    expect(updated).toMatchObject({
      class_code: '13B',
      class_name: '3年Bクラス',
    });
    await expect(repo.delete(created.class_room_id)).resolves.toBe(true);
    await expect(repo.findById(created.class_room_id)).resolves.toBeNull();
  });

  it('class_codeの一意制約を適用する', async () => {
    await expect(
      repo.create({
        class_code: 'IA14A',
        class_name: '重複クラス',
        teacher_id: null,
      })
    ).rejects.toThrow(/UNIQUE/);
  });

  it('学生の所属有無を返す', async () => {
    const classrooms = (await repo.findAll(20, 0)).classrooms;
    const assigned = classrooms.find(c => c.class_code === '12B');
    const unassigned = classrooms.find(c => c.class_code === 'IA14A');

    await expect(repo.hasStudents(assigned!.class_room_id)).resolves.toBe(true);
    await expect(repo.hasStudents(unassigned!.class_room_id)).resolves.toBe(
      false
    );
  });

  describe('findByCode', () => {
    it('class_codeでクラスを取得できる', async () => {
      await expect(repo.findByCode('IA14A')).resolves.toMatchObject({
        class_code: 'IA14A',
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
        { class_code: '14D', class_name: '4年Dクラス', teacher_id: null },
        { class_code: '14E', class_name: '4年Eクラス', teacher_id: null },
      ]);

      await expect(repo.findByCode('14D')).resolves.toMatchObject({
        class_name: '4年Dクラス',
      });
      await expect(repo.findByCode('14E')).resolves.toMatchObject({
        class_name: '4年Eクラス',
      });
    });

    it('空配列の場合は何も作成しない', async () => {
      const before = (await repo.findAll(100, 0)).total;
      await repo.createMany([]);
      const after = (await repo.findAll(100, 0)).total;
      expect(after).toBe(before);
    });

    it('class_codeが重複する行がある場合は1件も登録しない', async () => {
      await expect(
        repo.createMany([
          { class_code: '15A', class_name: '5年Aクラス', teacher_id: null },
          { class_code: 'IA14A', class_name: '重複クラス', teacher_id: null },
        ])
      ).rejects.toThrow();

      await expect(repo.findByCode('15A')).resolves.toBeNull();
    });

    it('2,000件のクラスをまとめて作成できる', async () => {
      const inputs = Array.from({ length: 2000 }, (_, i) => ({
        class_code: `BULK2K-${i}`,
        class_name: `一括クラス${i}`,
        teacher_id: null,
      }));

      await repo.createMany(inputs);

      await expect(repo.findByCode('BULK2K-0')).resolves.toMatchObject({
        class_name: '一括クラス0',
      });
      await expect(repo.findByCode('BULK2K-1999')).resolves.toMatchObject({
        class_name: '一括クラス1999',
      });
    });
  });
});
