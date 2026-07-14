import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

// 既知のバグ: users テーブルの列名は migrations/0006_create_users.sql で
// users_id として作成されている（microsoft_account_links.user_id の参照先も
// users(users_id)）が、UserRepository.ts は一貫して user_id という存在しない列名を
// 参照している。そのため findUserIdByMicrosoftAccount / createUserWithMicrosoftLink /
// updateUser はいずれも D1_ERROR で失敗する。authService.upsertUser（Microsoft
// ログイン経路）からも到達可能なため、実運用でもログインのたびにエラーになる。
// このテストは修正ではなく、現状の（壊れた）挙動を明文化するためのもの。
describe('UserRepository', () => {
  let repo: IUserRepository;

  beforeAll(() => {
    repo = createUserRepository(env.DB);
  });

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM microsoft_account_links').run();
    await env.DB.prepare('DELETE FROM users').run();
  });

  describe('findUserIdByMicrosoftAccount', () => {
    it('users.user_id という存在しない列を参照するため D1_ERROR で失敗する', async () => {
      await expect(
        repo.findUserIdByMicrosoftAccount('oid-1', 'tid-1')
      ).rejects.toThrow('no such column: u.user_id');
    });
  });

  describe('createUserWithMicrosoftLink', () => {
    it('users テーブルに user_id という列が無いため D1_ERROR で失敗する', async () => {
      await expect(
        repo.createUserWithMicrosoftLink({
          oid: 'oid-1',
          tid: 'tid-1',
          sub: 'sub-1',
          email: 'tanaka@example.com',
          displayName: '田中太郎',
          uid: 'tid-1:oid-1',
          studentNumber: 'ms:tid-1:oid-1',
        })
      ).rejects.toThrow('table users has no column named user_id');
    });
  });

  describe('updateUser', () => {
    it('users テーブルに user_id という列が無いため D1_ERROR で失敗する', async () => {
      await expect(
        repo.updateUser({
          userId: 'user-1',
          oid: 'oid-1',
          tid: 'tid-1',
          sub: 'sub-1',
          email: 'tanaka@example.com',
          displayName: '田中太郎',
          uid: 'tid-1:oid-1',
        })
      ).rejects.toThrow('no such column: user_id');
    });
  });
});
