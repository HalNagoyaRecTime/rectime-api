import { env as workerEnv } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'r'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };
let token: string;

async function insertUser(userName: string): Promise<number> {
  const user = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  if (!user) throw new Error('ユーザーを作成できませんでした');
  return user.user_id;
}

beforeAll(async () => {
  const staffUserId = await insertUser('一覧の件数を確かめる職員');
  const studentUserId = await insertUser('一覧の件数を確かめる生徒');
  const teacherUserId = await insertUser('一覧の件数を確かめる教員');
  await workerEnv.DB.batch([
    workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)').bind(
      staffUserId
    ),
    workerEnv.DB.prepare(
      'INSERT INTO students (user_id, student_id_number) VALUES (?, ?)'
    ).bind(studentUserId, 'TOTAL0001'),
    workerEnv.DB.prepare(
      'INSERT INTO teachers (user_id, email) VALUES (?, ?)'
    ).bind(teacherUserId, 'total-check@example.com'),
  ]);
  token = await signAccessToken(
    {
      sub: String(staffUserId),
      oid: `list-total-${staffUserId}`,
      email: `list-total-${staffUserId}@example.com`,
      display_name: '一覧の件数を確かめる職員',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
});

async function getPage(path: string): Promise<Record<string, unknown>> {
  const response = await app.fetch(
    new Request(`http://example.com${path}`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Client-Type': 'web' },
    }),
    testEnv
  );
  expect(response.status).toBe(200);
  return response.json();
}

describe.each(['/api/v1/students', '/api/v1/teachers'])(
  '%sの応答のtotal',
  path => {
    it.each([
      ['includeTotalを省略した', ''],
      ['includeTotal=trueの', '?includeTotal=true'],
    ])('%sときはtotalを含む', async (_, query) => {
      const page = await getPage(`${path}${query}`);

      expect(page.items).toHaveLength(1);
      expect(page.total).toBe(1);
    });

    it('includeTotal=falseのときはtotalを含まない', async () => {
      const page = await getPage(`${path}?includeTotal=false`);

      expect(page.items).toHaveLength(1);
      expect(page).not.toHaveProperty('total');
    });
  }
);
