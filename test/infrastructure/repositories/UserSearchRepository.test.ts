import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserSearchRepository } from '../../../src/infrastructure/repositories/UserSearchRepository';
import type { IUserSearchRepository } from '../../../src/domain/interfaces/repositories/IUserSearchRepository';

describe('UserSearchRepository', () => {
  let repository: IUserSearchRepository;

  beforeAll(() => {
    repository = createUserSearchRepository(env.DB);
  });

  beforeEach(async () => {
    await env.DB.prepare(
      "DELETE FROM students WHERE user_id IN (SELECT user_id FROM users WHERE user_name LIKE '検索テスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM class_rooms WHERE class_code LIKE 'SEARCH-%'"
    ).run();
    await env.DB.prepare(
      "DELETE FROM teachers WHERE user_id IN (SELECT user_id FROM users WHERE user_name LIKE '検索テスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM staffs WHERE user_id IN (SELECT user_id FROM users WHERE user_name LIKE '検索テスト%')"
    ).run();
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name LIKE '検索テスト%'"
    ).run();
  });

  async function insertUser(name: string, active = 1): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO users (user_name, is_live_active) VALUES (?, ?) RETURNING user_id'
    )
      .bind(name, active)
      .first<{ user_id: number }>();
    return row!.user_id;
  }

  async function insertClassRoom(code: string, name: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO class_rooms (class_code, class_name) VALUES (?, ?) RETURNING class_room_id'
    )
      .bind(code, name)
      .first<{ class_room_id: number }>();
    return row!.class_room_id;
  }

  it('ユーザーを重複なくカテゴリ付きで返す', async () => {
    const both = await insertUser('検索テスト兼任');
    const student = await insertUser('検索テスト学生');
    const inactive = await insertUser('検索テスト無効', 0);
    const studentRoom = await insertClassRoom('SEARCH-S', '検索クラス');
    const teacherRoom = await insertClassRoom('SEARCH-T', '教員クラス');

    await env.DB.prepare(
      'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, ?, ?)'
    )
      .bind(both, studentRoom, 1, 'SEARCH-BOTH')
      .run();
    await env.DB.prepare(
      'INSERT INTO teachers (user_id) VALUES (?) RETURNING teacher_id'
    )
      .bind(both)
      .run();
    const teacher = await env.DB.prepare(
      'INSERT INTO teachers (user_id) VALUES (?) RETURNING teacher_id'
    )
      .bind(inactive)
      .first<{ teacher_id: number }>();
    await env.DB.prepare(
      'UPDATE class_rooms SET teacher_id = ? WHERE class_room_id = ?'
    )
      .bind(teacher!.teacher_id, teacherRoom)
      .run();
    await env.DB.prepare(
      'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, ?, ?)'
    )
      .bind(student, studentRoom, 2, 'SEARCH-STUDENT')
      .run();

    await expect(
      repository.findAll({
        q: '検索テスト',
        category: 'all',
        status: 'active',
        limit: 50,
        offset: 0,
      })
    ).resolves.toMatchObject({
      total: 2,
      items: [
        {
          user_id: both,
          categories: ['student', 'teacher'],
        },
        {
          user_id: student,
          categories: ['student'],
        },
      ],
    });
  });

  it('名前・ID・クラス名／コードで検索し、カテゴリと状態を絞り込む', async () => {
    const student = await insertUser('検索テスト田中');
    const teacher = await insertUser('検索テスト教員');
    const room = await insertClassRoom('SEARCH-ROOM', '横断検索クラス');
    await env.DB.prepare(
      'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, ?, ?)'
    )
      .bind(student, room, 1, 'SEARCH-Q-1')
      .run();
    const teacherRow = await env.DB.prepare(
      'INSERT INTO teachers (user_id) VALUES (?) RETURNING teacher_id'
    )
      .bind(teacher)
      .first<{ teacher_id: number }>();
    await env.DB.prepare(
      'UPDATE class_rooms SET teacher_id = ? WHERE class_room_id = ?'
    )
      .bind(teacherRow!.teacher_id, room)
      .run();

    await expect(
      repository.findAll({
        q: '横断検索',
        category: 'teacher',
        status: 'active',
        limit: 50,
        offset: 0,
      })
    ).resolves.toMatchObject({ total: 1, items: [{ user_id: teacher }] });

    await expect(
      repository.findAll({
        q: String(student),
        category: 'student',
        status: 'active',
        limit: 50,
        offset: 0,
      })
    ).resolves.toMatchObject({ total: 1, items: [{ user_id: student }] });
  });

  it('limitとoffsetを適用する', async () => {
    await insertUser('検索テストA');
    await insertUser('検索テストB');
    await insertUser('検索テストC');

    await expect(
      repository.findAll({
        q: '検索テスト',
        category: 'all',
        status: 'active',
        limit: 1,
        offset: 1,
      })
    ).resolves.toMatchObject({
      total: 3,
      items: [{ display_name: '検索テストB' }],
    });
  });
});
