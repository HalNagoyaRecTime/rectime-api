import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import type { TeacherSearchFilter } from '../../../src/domain/entities/Teacher';
import { createTeacherRepository } from '../../../src/infrastructure/repositories/TeacherRepository';
import { createReadCountingDb } from '../../readCountingDb';

const STUDENTS = 1000;
const TEACHERS = 60;
const SEQ = `WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < ${STUDENTS - 1})`;

async function seed() {
  await env.DB.batch(
    [
      'microsoft_account_links',
      'staffs',
      'students',
      'class_rooms',
      'teachers',
      'teams',
      'users',
    ].map(table => env.DB.prepare(`DELETE FROM ${table}`))
  );
  await env.DB.batch([
    env.DB.prepare(
      `${SEQ} INSERT INTO users (user_name, is_live_active)
       SELECT CASE WHEN n < ${TEACHERS} THEN '教員' ELSE '生徒' END || n,
              CASE WHEN n % 7 = 0 THEN 0 ELSE 1 END
       FROM seq`
    ),
    env.DB.prepare(
      `INSERT INTO teachers (user_id, email)
       SELECT user_id, 't' || user_id || '@example.com'
       FROM users WHERE user_name LIKE '教員%'`
    ),
    env.DB.prepare(
      `INSERT INTO students (user_id, student_id_number)
       SELECT user_id, 'S' || user_id FROM users WHERE user_name LIKE '生徒%'`
    ),
    env.DB.prepare(
      'INSERT INTO staffs (user_id) SELECT user_id FROM users WHERE user_id % 10 = 0'
    ),
  ]);
}

describe('教員一覧のD1読み取り行数', () => {
  const counting = createReadCountingDb();
  const repo = createTeacherRepository(counting.db);

  beforeAll(seed);

  it.each([
    ['停止中も含めた教員', {}],
    ['職員を兼ねる教員', { isStaff: true }],
    ['有効な教員', { isLiveActive: true }],
  ] as [string, TeacherSearchFilter][])(
    'includeTotal=falseで%sを取るときは件数を数えるための読み取りをしない',
    async (_, filter) => {
      const query = { ...filter, limit: 100, offset: 0 };
      counting.reset();
      const withTotal = await repo.findAll(query);
      const rowsReadWithTotal = counting.rowsRead();

      counting.reset();
      const withoutTotal = await repo.findAll({
        ...query,
        includeTotal: false,
      });

      expect(withoutTotal.items).toEqual(withTotal.items);
      expect(withoutTotal.items.length).toBeGreaterThan(0);
      expect(withoutTotal.total).toBeUndefined();
      expect(counting.rowsRead()).toBeLessThanOrEqual(
        rowsReadWithTotal - TEACHERS
      );
    }
  );
});
