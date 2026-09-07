import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserActivationRepository } from '../../../src/infrastructure/repositories/UserActivationRepository';
import type { IUserActivationRepository } from '../../../src/domain/interfaces/repositories/IUserActivationRepository';

describe('UserActivationRepository', () => {
  let repository: IUserActivationRepository;

  beforeAll(() => {
    repository = createUserActivationRepository(env.DB);
  });

  beforeEach(async () => {
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name LIKE '有効判定テスト%'"
    ).run();
  });

  async function insertUser(name: string, active: number): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO users (user_name, is_live_active) VALUES (?, ?) RETURNING user_id'
    )
      .bind(name, active)
      .first<{ user_id: number }>();
    return row!.user_id;
  }

  it('is_live_active が 1 のユーザーは true を返す', async () => {
    const userId = await insertUser('有効判定テスト有効', 1);

    expect(await repository.isActive(userId)).toBe(true);
  });

  it('is_live_active が 0 のユーザーは false を返す', async () => {
    const userId = await insertUser('有効判定テスト無効', 0);

    expect(await repository.isActive(userId)).toBe(false);
  });

  it('存在しないユーザーIDの場合は false を返す', async () => {
    expect(await repository.isActive(-1)).toBe(false);
  });

  it('無効化された後は同じユーザーIDでも false になる', async () => {
    const userId = await insertUser('有効判定テスト切替', 1);
    expect(await repository.isActive(userId)).toBe(true);

    await env.DB.prepare(
      'UPDATE users SET is_live_active = 0 WHERE user_id = ?'
    )
      .bind(userId)
      .run();

    expect(await repository.isActive(userId)).toBe(false);
  });
});
