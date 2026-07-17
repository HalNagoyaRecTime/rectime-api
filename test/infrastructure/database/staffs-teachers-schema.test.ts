import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// staffs/teachers は migrations/0011 で追加されたロール拡張テーブルで、
// まだ専用のリポジトリ層を持たない。ここでは students と同様に
// 「1ユーザーにつき最大1行（1:1）」の制約（user_id への UNIQUE と、
// users を参照する FOREIGN KEY）がスキーマレベルで正しく機能することを
// 直接SQLで検証する。
describe('staffs/teachers テーブルの制約', () => {
  afterEach(async () => {
    await env.DB.prepare(
      "DELETE FROM staffs WHERE user_id IN (SELECT user_id FROM users WHERE user_name LIKE 'スキーマテスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM teachers WHERE user_id IN (SELECT user_id FROM users WHERE user_name LIKE 'スキーマテスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name LIKE 'スキーマテスト%'"
    ).run();
  });

  async function createTestUser(name: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
    )
      .bind(name)
      .first<{ user_id: number }>();
    if (!row) throw new Error('failed to create test user');
    return row.user_id;
  }

  describe('staffs', () => {
    it('users を参照する staff 行を作成できる', async () => {
      const userId = await createTestUser('スキーマテスト職員');

      const staff = await env.DB.prepare(
        'INSERT INTO staffs (user_id) VALUES (?) RETURNING staff_id, user_id'
      )
        .bind(userId)
        .first<{ staff_id: number; user_id: number }>();

      expect(staff).toMatchObject({ user_id: userId });
    });

    it('同じ user_id で2行目を作ろうとすると UNIQUE 制約で失敗する', async () => {
      const userId = await createTestUser('スキーマテスト職員2');
      await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
        .bind(userId)
        .run();

      await expect(
        env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
          .bind(userId)
          .run()
      ).rejects.toThrow('UNIQUE constraint failed');
    });

    it('存在しない user_id では FOREIGN KEY 制約で失敗する', async () => {
      await expect(
        env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
          .bind(999999)
          .run()
      ).rejects.toThrow('FOREIGN KEY constraint failed');
    });
  });

  describe('teachers', () => {
    it('users を参照する teacher 行を作成できる', async () => {
      const userId = await createTestUser('スキーマテスト教員');

      const teacher = await env.DB.prepare(
        'INSERT INTO teachers (user_id) VALUES (?) RETURNING teacher_id, user_id'
      )
        .bind(userId)
        .first<{ teacher_id: number; user_id: number }>();

      expect(teacher).toMatchObject({ user_id: userId });
    });

    it('同じ user_id で2行目を作ろうとすると UNIQUE 制約で失敗する', async () => {
      const userId = await createTestUser('スキーマテスト教員2');
      await env.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
        .bind(userId)
        .run();

      await expect(
        env.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
          .bind(userId)
          .run()
      ).rejects.toThrow('UNIQUE constraint failed');
    });

    it('存在しない user_id では FOREIGN KEY 制約で失敗する', async () => {
      await expect(
        env.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
          .bind(999999)
          .run()
      ).rejects.toThrow('FOREIGN KEY constraint failed');
    });
  });

  it('同じユーザーが staff と teacher の両方になれる（相互排他ではない）', async () => {
    const userId = await createTestUser('スキーマテスト兼務');

    await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(userId)
      .run();
    await env.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
      .bind(userId)
      .run();

    const staff = await env.DB.prepare(
      'SELECT staff_id FROM staffs WHERE user_id = ?'
    )
      .bind(userId)
      .first();
    const teacher = await env.DB.prepare(
      'SELECT teacher_id FROM teachers WHERE user_id = ?'
    )
      .bind(userId)
      .first();

    expect(staff).not.toBeNull();
    expect(teacher).not.toBeNull();
  });
});
