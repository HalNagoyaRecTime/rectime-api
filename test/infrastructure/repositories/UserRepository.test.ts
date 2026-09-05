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

  describe('exists', () => {
    it('存在するuserIdの場合はtrueを返す', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('存在確認テスト') RETURNING user_id"
      ).first<{ user_id: number }>();

      await expect(repo.exists(user!.user_id)).resolves.toBe(true);
    });

    it('存在しないuserIdの場合はfalseを返す', async () => {
      await expect(repo.exists(999999)).resolves.toBe(false);
    });
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

  describe('isStaff', () => {
    it('staffsに登録されたユーザーはtrueを返す', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('管理者') RETURNING user_id"
      ).first<{ user_id: number }>();
      await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
        .bind(user!.user_id)
        .run();

      await expect(repo.isStaff(user!.user_id)).resolves.toBe(true);
    });

    it('teachersにのみ登録されたユーザーはfalseを返す', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('教員') RETURNING user_id"
      ).first<{ user_id: number }>();
      await env.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
        .bind(user!.user_id)
        .run();

      await expect(repo.isStaff(user!.user_id)).resolves.toBe(false);
    });

    it('studentsにのみ登録されたユーザーはfalseを返す', async () => {
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

      await expect(repo.isStaff(user!.user_id)).resolves.toBe(false);
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

  describe('linkMicrosoftAccount', () => {
    it('指定したuser_idにMicrosoftアカウントを紐付ける', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('学生太郎') RETURNING user_id"
      ).first<{ user_id: number }>();

      await repo.linkMicrosoftAccount({
        userId: String(user!.user_id),
        oid: 'oid-link-1',
        tid: 'tid-link-1',
      });

      await expect(
        repo.findUserIdByMicrosoftAccount('oid-link-1', 'tid-link-1')
      ).resolves.toBe(String(user!.user_id));
    });

    it('既に別のMicrosoftアカウントと紐付いているuser_idを指定すると、UNIQUE制約違反のエラーを投げる', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('学生太郎') RETURNING user_id"
      ).first<{ user_id: number }>();
      await repo.linkMicrosoftAccount({
        userId: String(user!.user_id),
        oid: 'oid-existing',
        tid: 'tid-existing',
      });

      await expect(
        repo.linkMicrosoftAccount({
          userId: String(user!.user_id),
          oid: 'oid-new',
          tid: 'tid-new',
        })
      ).rejects.toThrow(
        /UNIQUE constraint failed.*microsoft_account_links\.user_id/
      );
    });

    it('既に登録済みのoid/tidの組み合わせを、別のuser_idに紐付けようとするとUNIQUE制約違反のエラーを投げる', async () => {
      const userA = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('学生A') RETURNING user_id"
      ).first<{ user_id: number }>();
      const userB = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('学生B') RETURNING user_id"
      ).first<{ user_id: number }>();
      await repo.linkMicrosoftAccount({
        userId: String(userA!.user_id),
        oid: 'oid-dup',
        tid: 'tid-dup',
      });

      await expect(
        repo.linkMicrosoftAccount({
          userId: String(userB!.user_id),
          oid: 'oid-dup',
          tid: 'tid-dup',
        })
      ).rejects.toThrow(
        /UNIQUE constraint failed.*microsoft_account_links\.oid/
      );
    });

    it('deletion_statusがactiveでないuser_idには紐付けず、ACCOUNT_DELETION_PENDINGを投げる', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name, deletion_status) VALUES ('学生太郎', 'deletion_pending') RETURNING user_id"
      ).first<{ user_id: number }>();

      await expect(
        repo.linkMicrosoftAccount({
          userId: String(user!.user_id),
          oid: 'oid-inactive',
          tid: 'tid-inactive',
        })
      ).rejects.toThrow('ACCOUNT_DELETION_PENDING');

      await expect(
        repo.findUserIdByMicrosoftAccount('oid-inactive', 'tid-inactive')
      ).resolves.toBeNull();
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

    it('deletion_statusがactiveでないuser_idの場合は更新せずnullを返す', async () => {
      const created = await repo.createUserWithMicrosoftLink({
        oid: 'oid-inactive-update',
        tid: 'tid-inactive-update',
        sub: 'sub-inactive-update',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });
      await env.DB.prepare(
        "UPDATE users SET deletion_status = 'deletion_pending' WHERE user_id = ?"
      )
        .bind(created.id)
        .run();

      await expect(
        repo.updateUser({
          userId: created.id,
          oid: 'oid-inactive-update',
          tid: 'tid-inactive-update',
          sub: 'sub-inactive-update',
          email: 'tanaka@example.com',
          displayName: '田中花子',
        })
      ).resolves.toBeNull();

      const row = await env.DB.prepare(
        'SELECT user_name FROM users WHERE user_id = ?'
      )
        .bind(created.id)
        .first();
      expect(row).toMatchObject({ user_name: '田中太郎' });
    });
  });

  describe('markAsDeleted', () => {
    it('deletion_statusをdeletedにし、microsoft_account_linksを削除する', async () => {
      const created = await repo.createUserWithMicrosoftLink({
        oid: 'oid-deleted-1',
        tid: 'tid-deleted-1',
        sub: 'sub-deleted-1',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });

      await expect(repo.markAsDeleted(created.id)).resolves.toBe(true);

      const userRow = await env.DB.prepare(
        'SELECT deletion_status, deleted_at, purged_at FROM users WHERE user_id = ?'
      )
        .bind(created.id)
        .first<{
          deletion_status: string;
          deleted_at: string | null;
          purged_at: string | null;
        }>();
      expect(userRow?.deletion_status).toBe('deleted');
      expect(userRow?.deleted_at).not.toBeNull();
      // markAsDeletedの時点では、関連データの削除・匿名化(後片付け)は
      // まだ完了していない。
      expect(userRow?.purged_at).toBeNull();

      const link = await env.DB.prepare(
        'SELECT * FROM microsoft_account_links WHERE user_id = ?'
      )
        .bind(created.id)
        .first();
      expect(link).toBeNull();

      // links が消えているため、同じ oid/tid では既存ユーザーとして
      // 見つからなくなる(再登録時に新規作成経路へ進める)。
      await expect(
        repo.findUserIdByMicrosoftAccount('oid-deleted-1', 'tid-deleted-1')
      ).resolves.toBeNull();
    });

    it('存在しないuserIdの場合はfalseを返す', async () => {
      await expect(repo.markAsDeleted('999999')).resolves.toBe(false);
    });

    it('microsoft_account_linksが無いユーザーでも冪等に成功する', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('リンク無し') RETURNING user_id"
      ).first<{ user_id: number }>();

      await expect(repo.markAsDeleted(String(user!.user_id))).resolves.toBe(
        true
      );
    });
  });

  describe('markAsPurged / isPurged', () => {
    it('markAsPurgedはpurged_atに完了時刻をセットし、isPurgedがtrueを返すようになる', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name, deletion_status) VALUES ('後片付け太郎', 'deleted') RETURNING user_id"
      ).first<{ user_id: number }>();
      const userId = String(user!.user_id);

      await expect(repo.isPurged(userId)).resolves.toBe(false);

      await expect(repo.markAsPurged(userId)).resolves.toBe(true);

      const row = await env.DB.prepare(
        'SELECT deletion_status, purged_at FROM users WHERE user_id = ?'
      )
        .bind(user!.user_id)
        .first<{ deletion_status: string; purged_at: string | null }>();
      expect(row?.deletion_status).toBe('deleted');
      expect(row?.purged_at).not.toBeNull();
      await expect(repo.isPurged(userId)).resolves.toBe(true);
    });

    it('存在しないuserIdの場合、markAsPurgedはfalseを返す', async () => {
      await expect(repo.markAsPurged('999999')).resolves.toBe(false);
    });

    it('存在しないuserIdの場合、isPurgedはfalseを返す', async () => {
      await expect(repo.isPurged('999999')).resolves.toBe(false);
    });
  });

  describe('anonymizeUser', () => {
    it('user_nameを固定文字列に書き換える', async () => {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('匿名化対象太郎') RETURNING user_id"
      ).first<{ user_id: number }>();

      await expect(repo.anonymizeUser(String(user!.user_id))).resolves.toBe(
        true
      );

      const row = await env.DB.prepare(
        'SELECT user_name FROM users WHERE user_id = ?'
      )
        .bind(user!.user_id)
        .first<{ user_name: string }>();
      expect(row?.user_name).toBe('削除済みユーザー');
    });

    it('存在しないuserIdの場合はfalseを返す', async () => {
      await expect(repo.anonymizeUser('999999')).resolves.toBe(false);
    });
  });
});
