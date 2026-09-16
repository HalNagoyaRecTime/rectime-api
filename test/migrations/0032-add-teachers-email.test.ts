import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

async function insertUser(userName: string): Promise<number> {
  const user = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  return user!.user_id;
}

describe('0032_add_teachers_email.sql', () => {
  it('teachersのemailはNOT NULLで、UNIQUEインデックスを持つ', async () => {
    const columns = await env.DB.prepare('PRAGMA table_info(teachers)').all<{
      name: string;
      notnull: number;
    }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'email', notnull: 1 }),
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

  it('emailを指定せずに教員を登録できない', async () => {
    const userId = await insertUser('email未指定');

    await expect(
      env.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
        .bind(userId)
        .run()
    ).rejects.toThrow(/NOT NULL/);
  });

  it('emailにNULLを指定して教員を登録できない', async () => {
    const userId = await insertUser('emailがNULL');

    await expect(
      env.DB.prepare('INSERT INTO teachers (user_id, email) VALUES (?, NULL)')
        .bind(userId)
        .run()
    ).rejects.toThrow(/NOT NULL/);
  });

  it('同じemailの教員は2行登録できない', async () => {
    const firstUserId = await insertUser('重複検証1');
    const secondUserId = await insertUser('重複検証2');

    await env.DB.prepare('INSERT INTO teachers (user_id, email) VALUES (?, ?)')
      .bind(firstUserId, 'migration-dup@example.ac.jp')
      .run();

    await expect(
      env.DB.prepare('INSERT INTO teachers (user_id, email) VALUES (?, ?)')
        .bind(secondUserId, 'migration-dup@example.ac.jp')
        .run()
    ).rejects.toThrow(/UNIQUE/);
  });

  it('class_rooms.teacher_id の外部キーがテーブル再作成後も有効', async () => {
    const userId = await insertUser('FK検証教員');
    const teacher = await env.DB.prepare(
      'INSERT INTO teachers (user_id, email) VALUES (?, ?) RETURNING teacher_id'
    )
      .bind(userId, 'fk-check@example.ac.jp')
      .first<{ teacher_id: number }>();

    await env.DB.prepare(
      'INSERT INTO class_rooms (class_code, class_name, teacher_id) VALUES (?, ?, ?)'
    )
      .bind('FK-CHECK', 'FK検証クラス', teacher!.teacher_id)
      .run();

    await expect(
      env.DB.prepare(
        'INSERT INTO class_rooms (class_code, class_name, teacher_id) VALUES (?, ?, ?)'
      )
        .bind('FK-CHECK-NG', 'FK検証クラス(不正)', 999999)
        .run()
    ).rejects.toThrow(/FOREIGN KEY/);
  });
});
