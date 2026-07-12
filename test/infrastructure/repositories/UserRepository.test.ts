import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

// 既知のバグ: migrations/0010_upgrade_users.sql で users テーブルが
// 「Microsoft連携・通知登録用の旧テーブル」（auth_users にリネーム）と
// 「生徒プロフィール用の新テーブル」（user_id/user_name/is_live_active のみを持つ）
// に分割されたが、UserRepository.ts は更新されておらず、旧スキーマ前提のまま
// 新しい users テーブルを参照している。そのため:
// - findUserIdByMicrosoftAccount は例外を投げず、無関係な users.user_id と
//   microsoft_account_links.user_id を突き合わせて常に null を返す（サイレントに
//   何も見つからない = 常に新規ユーザー作成扱いになる）
// - createUserWithMicrosoftLink / updateUser は users テーブルに存在しない
//   display_name / uid / student_number 列を参照するため D1_ERROR で失敗する
// authService.upsertUser（Microsoftログイン経路）からも到達可能なため、
// 実運用でもログインのたびに失敗する。このテストは修正ではなく、
// 現状の（壊れた）挙動を明文化するためのもの。
describe('UserRepository', () => {
  let repo: IUserRepository;

  beforeAll(() => {
    repo = createUserRepository(env.DB);
  });

  beforeEach(async () => {
    // users は students から参照される共有テーブルのため全削除はできない。
    // ここでは microsoft_account_links のみをクリアする（このテーブルには依存先が無い）
    await env.DB.prepare('DELETE FROM microsoft_account_links').run();
  });

  describe('findUserIdByMicrosoftAccount', () => {
    it('users(生徒プロフィール用)とmicrosoft_account_linksを無関係な列で突き合わせるため、常に null を返す', async () => {
      await expect(
        repo.findUserIdByMicrosoftAccount('oid-1', 'tid-1')
      ).resolves.toBeNull();
    });
  });

  describe('createUserWithMicrosoftLink', () => {
    it('users テーブルに display_name 列が無いため D1_ERROR で失敗する', async () => {
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
      ).rejects.toThrow('table users has no column named display_name');
    });
  });

  describe('updateUser', () => {
    it('users テーブルに display_name 列が無いため D1_ERROR で失敗する', async () => {
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
      ).rejects.toThrow('no such column: display_name');
    });
  });
});
