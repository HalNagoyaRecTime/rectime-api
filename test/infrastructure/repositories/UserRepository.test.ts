import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

// migrations/0011 で microsoft_account_links は auth_users(users_id: TEXTのUUID) ではなく
// users(user_id: INTEGER自動採番) を参照するようになった。UserRepository は
// Microsoft 連携ユーザーの実体を users 側に持つ（students/staffs/teachers と共通のID空間）。
describe('UserRepository', () => {
  let repo: IUserRepository;

  beforeAll(() => {
    repo = createUserRepository(env.DB);
  });

  beforeEach(async () => {
    // students/staffs/teachers が users を参照するため、子から順に削除する
    await env.DB.prepare('DELETE FROM gathering_group_members').run();
    await env.DB.prepare('DELETE FROM notification_schedules').run();
    await env.DB.prepare('DELETE FROM gatherings').run();
    await env.DB.prepare('DELETE FROM events').run();
    await env.DB.prepare('DELETE FROM microsoft_account_links').run();
    await env.DB.prepare('DELETE FROM staffs').run();
    await env.DB.prepare('DELETE FROM teachers').run();
    await env.DB.prepare('DELETE FROM students').run();
    await env.DB.prepare('DELETE FROM users').run();
  });

  describe('findUserIdByMicrosoftAccount', () => {
    it('未登録の oid/tid の場合は null を返す', async () => {
      await expect(
        repo.findUserIdByMicrosoftAccount('oid-1', 'tid-1')
      ).resolves.toBeNull();
    });

    it('登録済みの oid/tid の場合は users.user_id を返す', async () => {
      const created = await repo.createUserWithMicrosoftLink({
        oid: 'oid-2',
        tid: 'tid-2',
        sub: 'sub-2',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });

      await expect(
        repo.findUserIdByMicrosoftAccount('oid-2', 'tid-2')
      ).resolves.toBe(created.id);
    });
  });

  describe('isStaffOrTeacher', () => {
    it.each(['staffs', 'teachers'] as const)(
      '%sに登録されたユーザーには更新権限がある',
      async table => {
        const user = await env.DB.prepare(
          "INSERT INTO users (user_name) VALUES ('管理者') RETURNING user_id"
        ).first<{ user_id: number }>();
        await env.DB.prepare(`INSERT INTO ${table} (user_id) VALUES (?)`)
          .bind(user!.user_id)
          .run();

        await expect(repo.isStaffOrTeacher(user!.user_id)).resolves.toBe(true);
      }
    );

    it('studentsにのみ登録されたユーザーには更新権限がない', async () => {
      const classRoom = await env.DB.prepare(
        "INSERT INTO class_rooms (class_code, class_name) VALUES ('AUTHZ', '権限確認') RETURNING class_room_id"
      ).first<{ class_room_id: number }>();
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('学生') RETURNING user_id"
      ).first<{ user_id: number }>();
      await env.DB.prepare(
        "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, 'AUTHZ-001')"
      )
        .bind(user!.user_id, classRoom!.class_room_id)
        .run();

      await expect(repo.isStaffOrTeacher(user!.user_id)).resolves.toBe(false);
    });
  });

  describe('getUserCategories', () => {
    it('studentsにのみ登録されたユーザーはis_studentのみtrue', async () => {
      const classRoom = await env.DB.prepare(
        "INSERT INTO class_rooms (class_code, class_name) VALUES ('CAT', 'カテゴリ確認') RETURNING class_room_id"
      ).first<{ class_room_id: number }>();
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('学生') RETURNING user_id"
      ).first<{ user_id: number }>();
      await env.DB.prepare(
        "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, 'CAT-001')"
      )
        .bind(user!.user_id, classRoom!.class_room_id)
        .run();

      await expect(repo.getUserCategories(user!.user_id)).resolves.toEqual({
        is_student: true,
        is_staff: false,
        is_teacher: false,
      });
    });

    it.each(['staffs', 'teachers'] as const)(
      '%sにのみ登録されたユーザーはis_studentがfalseで該当カテゴリのみtrue',
      async table => {
        const user = await env.DB.prepare(
          "INSERT INTO users (user_name) VALUES ('職員') RETURNING user_id"
        ).first<{ user_id: number }>();
        await env.DB.prepare(`INSERT INTO ${table} (user_id) VALUES (?)`)
          .bind(user!.user_id)
          .run();

        await expect(repo.getUserCategories(user!.user_id)).resolves.toEqual({
          is_student: false,
          is_staff: table === 'staffs',
          is_teacher: table === 'teachers',
        });
      }
    );

    it('staffsとteachersの両方に登録されたユーザーは両方trueになる', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('兼任') RETURNING user_id"
      ).first<{ user_id: number }>();
      await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
        .bind(user!.user_id)
        .run();
      await env.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
        .bind(user!.user_id)
        .run();

      await expect(repo.getUserCategories(user!.user_id)).resolves.toEqual({
        is_student: false,
        is_staff: true,
        is_teacher: true,
      });
    });

    it('どのテーブルにも登録されていないユーザーはすべてfalse', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('未分類') RETURNING user_id"
      ).first<{ user_id: number }>();

      await expect(repo.getUserCategories(user!.user_id)).resolves.toEqual({
        is_student: false,
        is_staff: false,
        is_teacher: false,
      });
    });
  });

  describe('createUserWithMicrosoftLink', () => {
    it('users と microsoft_account_links に新規行を作成し、AppUser を返す', async () => {
      const result = await repo.createUserWithMicrosoftLink({
        oid: 'oid-3',
        tid: 'tid-3',
        sub: 'sub-3',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });

      expect(result).toEqual({
        id: result.id,
        oid: 'oid-3',
        tid: 'tid-3',
        sub: 'sub-3',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
      });

      const userRow = await env.DB.prepare(
        'SELECT user_name FROM users WHERE user_id = ?'
      )
        .bind(result.id)
        .first();
      expect(userRow).toMatchObject({ user_name: '田中太郎' });

      const linkRow = await env.DB.prepare(
        'SELECT oid, tid FROM microsoft_account_links WHERE user_id = ?'
      )
        .bind(result.id)
        .first();
      expect(linkRow).toMatchObject({ oid: 'oid-3', tid: 'tid-3' });
    });

    it('同じ oid/tid で2回作成しようとすると失敗し、孤立した users 行を残さない', async () => {
      await repo.createUserWithMicrosoftLink({
        oid: 'oid-6',
        tid: 'tid-6',
        sub: 'sub-6',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });

      await expect(
        repo.createUserWithMicrosoftLink({
          oid: 'oid-6',
          tid: 'tid-6',
          sub: 'sub-6-dup',
          email: 'dup@example.com',
          displayName: '田中太郎（重複）',
        })
      ).rejects.toThrow('UNIQUE constraint failed');

      const users = await env.DB.prepare(
        "SELECT user_id FROM users WHERE user_name = '田中太郎（重複）'"
      ).all();
      expect(users.results).toHaveLength(0);
    });
  });

  describe('updateUser', () => {
    it('既存ユーザーの user_name を更新し、AppUser を返す', async () => {
      const created = await repo.createUserWithMicrosoftLink({
        oid: 'oid-4',
        tid: 'tid-4',
        sub: 'sub-4',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });

      const updated = await repo.updateUser({
        userId: created.id,
        oid: 'oid-4',
        tid: 'tid-4',
        sub: 'sub-4',
        email: 'tanaka@example.com',
        displayName: '田中花子',
      });

      expect(updated).toEqual({
        id: created.id,
        oid: 'oid-4',
        tid: 'tid-4',
        sub: 'sub-4',
        email: 'tanaka@example.com',
        display_name: '田中花子',
      });

      const row = await env.DB.prepare(
        'SELECT user_name FROM users WHERE user_id = ?'
      )
        .bind(created.id)
        .first();
      expect(row).toMatchObject({ user_name: '田中花子' });
    });

    it('存在しない userId の場合は null を返す', async () => {
      await expect(
        repo.updateUser({
          userId: '999999',
          oid: 'oid-5',
          tid: 'tid-5',
          sub: 'sub-5',
          email: 'tanaka@example.com',
          displayName: '田中太郎',
        })
      ).resolves.toBeNull();
    });
  });
});
