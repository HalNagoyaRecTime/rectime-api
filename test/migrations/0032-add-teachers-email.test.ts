import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

async function insertTeacher(userName: string, email: string | null) {
  const user = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  await env.DB.prepare('INSERT INTO teachers (user_id, email) VALUES (?, ?)')
    .bind(user!.user_id, email)
    .run();
}

describe('0032_add_teachers_email.sql', () => {
  it('teachersにemail（NULL許容）とUNIQUEインデックスを追加する', async () => {
    const columns = await env.DB.prepare('PRAGMA table_info(teachers)').all<{
      name: string;
      notnull: number;
    }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'email', notnull: 0 }),
      ])
    );

    const indexes = await env.DB.prepare('PRAGMA index_list(teachers)').all<{
      name: string;
      unique: number;
    }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'uq_teachers_email', unique: 1 }),
      ])
    );
  });

  it('同じemailの教員は2行登録できない', async () => {
    await insertTeacher('重複検証1', 'migration-dup@example.ac.jp');

    await expect(
      insertTeacher('重複検証2', 'migration-dup@example.ac.jp')
    ).rejects.toThrow(/UNIQUE/);
  });

  it('emailがNULLの教員は複数行登録できる', async () => {
    const before = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM teachers WHERE email IS NULL'
    ).first<{ count: number }>();

    await insertTeacher('NULL検証1', null);
    await insertTeacher('NULL検証2', null);

    const after = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM teachers WHERE email IS NULL'
    ).first<{ count: number }>();
    expect(after!.count - before!.count).toBe(2);
  });
});
