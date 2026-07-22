import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClassRepository } from '../../../src/infrastructure/repositories/ClassRepository';
import type { IClassRepository } from '../../../src/domain/interfaces/repositories/IClassRepository';
import * as schema from '../../../src/infrastructure/database/schema';
import {
  class_rooms,
  students,
  teachers,
  users,
} from '../../../src/infrastructure/database/schema';

describe('ClassRepository', () => {
  let repo: IClassRepository;

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
        { classCode: '11A', name: '1年Aクラス' },
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

    repo = createClassRepository(env.DB);
  });

  describe('findAll', () => {
    it('class_rooms を class_room_id 昇順で返し、ページ情報を保持する', async () => {
      const result = await repo.findAll(1, 1);

      expect(result.classes).toHaveLength(1);
      expect(result).toMatchObject({ total: 2, page: 1, limit: 1 });
      const ids = result.classes.map(c => c.class_room_id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('学生数と担任をClassEntityへマッピングする', async () => {
      const result = await repo.findAll(1, 20);

      expect(result.classes[0]).toMatchObject({
        class_code: '12B',
        name: '2年Bクラス',
        student_count: 1,
        teacher: { display_name: '担任教員' },
      });
      expect(result.classes[1]).toMatchObject({
        class_code: '11A',
        name: '1年Aクラス',
        student_count: 0,
        teacher: null,
      });
    });
  });

  it('詳細を取得できる', async () => {
    const classroom = (await repo.findAll(1, 1)).classes[0];

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
      name: '3年Aクラス',
      teacher_id: null,
    });
    expect(created).toMatchObject({
      class_code: '13A',
      name: '3年Aクラス',
      student_count: 0,
      teacher: null,
    });

    const updated = await repo.update(created.class_room_id, {
      class_code: '13B',
      name: '3年Bクラス',
      teacher_id: null,
    });
    expect(updated).toMatchObject({ class_code: '13B', name: '3年Bクラス' });
    await expect(repo.delete(created.class_room_id)).resolves.toBe(true);
    await expect(repo.findById(created.class_room_id)).resolves.toBeNull();
  });

  it('class_codeの一意制約を適用する', async () => {
    await expect(
      repo.create({
        class_code: '11A',
        name: '重複クラス',
        teacher_id: null,
      })
    ).rejects.toThrow();
  });

  it('学生の所属有無を返す', async () => {
    const classes = (await repo.findAll(1, 20)).classes;
    const assigned = classes.find(c => c.class_code === '12B');
    const unassigned = classes.find(c => c.class_code === '11A');

    await expect(repo.hasStudents(assigned!.class_room_id)).resolves.toBe(true);
    await expect(repo.hasStudents(unassigned!.class_room_id)).resolves.toBe(
      false
    );
  });
});
