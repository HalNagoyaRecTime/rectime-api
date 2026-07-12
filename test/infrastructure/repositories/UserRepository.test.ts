import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

// migrations/0010_upgrade_users.sql で旧 users テーブルが auth_users にリネームされ、
// microsoft_account_links.user_id は auth_users(users_id) を参照するようになった。
// UserRepository は Microsoft 連携ユーザーの実体を auth_users 側に持つ
// （新しい users テーブルは students 用のプロフィールテーブルで無関係）。
describe('UserRepository', () => {
  let repo: IUserRepository;

  beforeAll(() => {
    repo = createUserRepository(env.DB);
  });

  beforeEach(async () => {
    // microsoft_account_links には依存先テーブルが無いため全削除できる。
    // auth_users は students とは無関係の独立テーブルなので合わせて全削除する。
    await env.DB.prepare('DELETE FROM microsoft_account_links').run();
    await env.DB.prepare('DELETE FROM auth_users').run();
  });

  describe('findUserIdByMicrosoftAccount', () => {
    it('未登録の oid/tid の場合は null を返す', async () => {
      await expect(
        repo.findUserIdByMicrosoftAccount('oid-1', 'tid-1')
      ).resolves.toBeNull();
    });

    it('登録済みの oid/tid の場合は auth_users.users_id を返す', async () => {
      const created = await repo.createUserWithMicrosoftLink({
        oid: 'oid-2',
        tid: 'tid-2',
        sub: 'sub-2',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
        uid: 'tid-2:oid-2',
        studentNumber: 'ms:tid-2:oid-2',
      });

      await expect(
        repo.findUserIdByMicrosoftAccount('oid-2', 'tid-2')
      ).resolves.toBe(created.id);
    });
  });

  describe('createUserWithMicrosoftLink', () => {
    it('auth_users と microsoft_account_links に新規行を作成し、AppUser を返す', async () => {
      const result = await repo.createUserWithMicrosoftLink({
        oid: 'oid-3',
        tid: 'tid-3',
        sub: 'sub-3',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
        uid: 'tid-3:oid-3',
        studentNumber: 'ms:tid-3:oid-3',
      });

      expect(result).toEqual({
        id: result.id,
        oid: 'oid-3',
        tid: 'tid-3',
        sub: 'sub-3',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
      });

      const row = await env.DB.prepare(
        'SELECT display_name, uid, student_number FROM auth_users WHERE users_id = ?'
      )
        .bind(result.id)
        .first();
      expect(row).toMatchObject({
        display_name: '田中太郎',
        uid: 'tid-3:oid-3',
        student_number: 'ms:tid-3:oid-3',
      });
    });
  });

  describe('updateUser', () => {
    it('既存ユーザーの display_name / uid を更新し、AppUser を返す', async () => {
      const created = await repo.createUserWithMicrosoftLink({
        oid: 'oid-4',
        tid: 'tid-4',
        sub: 'sub-4',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
        uid: 'tid-4:oid-4',
        studentNumber: 'ms:tid-4:oid-4',
      });

      const updated = await repo.updateUser({
        userId: created.id,
        oid: 'oid-4',
        tid: 'tid-4',
        sub: 'sub-4',
        email: 'tanaka@example.com',
        displayName: '田中花子',
        uid: 'tid-4:oid-4',
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
        'SELECT display_name FROM auth_users WHERE users_id = ?'
      )
        .bind(created.id)
        .first();
      expect(row).toMatchObject({ display_name: '田中花子' });
    });

    it('存在しない userId の場合は null を返す', async () => {
      await expect(
        repo.updateUser({
          userId: 'nonexistent-user-id',
          oid: 'oid-5',
          tid: 'tid-5',
          sub: 'sub-5',
          email: 'tanaka@example.com',
          displayName: '田中太郎',
          uid: 'tid-5:oid-5',
        })
      ).resolves.toBeNull();
    });
  });
});
