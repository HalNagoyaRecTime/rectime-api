import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../src/index';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import type { D1PreparedStatement } from '@cloudflare/workers-types';
import type { Env } from '../src/lib/env';
import { insertClassRoomWithTeam } from './fixtures/classRooms';

const JWT_SECRET = 's'.repeat(32);
const testEnv: Env = {
  ...workerEnv,
  JWT_SECRET,
  ALLOWED_ORIGINS: 'http://localhost:8080',
};
const db = workerEnv.DB;
const HEADER = 'ラウンド,開始時刻,集合時刻,集合場所,生徒';

let eventId: number;
let spotIds: Record<string, number>;
let staffToken: string;
let studentToken: string;

async function insertUser(name: string) {
  const row = await db
    .prepare('INSERT INTO users (user_name) VALUES (?) RETURNING user_id')
    .bind(name)
    .first<{ user_id: number }>();
  return row!.user_id;
}

async function insertStudents(classCode: string, count: number) {
  const { classRoomId } = await insertClassRoomWithTeam(db, {
    classCode,
    className: `${classCode}組`,
  });
  const userIds: number[] = [];
  for (let number = 1; number <= count; number++) {
    const userId = await insertUser(`${classCode} 生徒${number}`);
    await db
      .prepare(
        'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, ?, ?)'
      )
      .bind(userId, classRoomId, number, `${classCode}-${number}`)
      .run();
    userIds.push(userId);
  }
  return userIds;
}

function token(userId: number) {
  return signAccessToken(
    {
      sub: String(userId),
      oid: `gathering-import-${userId}`,
      email: `gathering-import-${userId}@example.com`,
      display_name: 'テストユーザー',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

function teamsName(classCode: string, number: number) {
  return `NH${classCode}${String(number).padStart(2, '0')} ${classCode} 生徒${number}`;
}

function csv(...rows: string[]) {
  return [HEADER, ...rows].join('\r\n');
}

function post(
  path: string,
  body: string | Uint8Array,
  fields: Record<string, string> = {},
  auth = staffToken,
  env: Env = testEnv
) {
  const form = new FormData();
  form.append('file', new File([body], 'gatherings.csv'));
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return app.fetch(
    new Request(`http://example.com/api/v1/events/${eventId}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'X-Client-Type': 'web' },
      body: form,
    }),
    env
  );
}

const preview = (body: string | Uint8Array) =>
  post('/gathering-imports/preview', body);

async function lockVersion() {
  const row = await db
    .prepare('SELECT lock_version FROM events WHERE event_id = ?')
    .bind(eventId)
    .first<{ lock_version: number }>();
  return row!.lock_version;
}

async function commit(body: string, version?: number) {
  return post('/gathering-imports', body, {
    lock_version: String(version ?? (await lockVersion())),
  });
}

async function savedGatherings() {
  const { results } = await db
    .prepare(
      `SELECT g.gathering_id, g.round, g.round_start_time, g.gathering_time,
              s.gathering_spot_name,
              (SELECT group_concat(u.user_name, '|') FROM (
                 SELECT m.user_id FROM gathering_group_members m
                 WHERE m.gathering_id = g.gathering_id ORDER BY m.user_id
               ) AS ordered JOIN users u ON u.user_id = ordered.user_id) AS members
       FROM gatherings g JOIN gathering_spots s USING (gathering_spot_id)
       WHERE g.event_id = ? ORDER BY g.round, g.gathering_time, s.gathering_spot_name`
    )
    .bind(eventId)
    .all<{
      gathering_id: number;
      round: number;
      round_start_time: string | null;
      gathering_time: string;
      gathering_spot_name: string;
      members: string | null;
    }>();
  return results;
}

beforeEach(async () => {
  for (const table of [
    'notification_push_deliveries',
    'notification_recipients',
    'notification_audiences',
    'notification_schedules',
    'notifications',
    'gathering_group_members',
    'gatherings',
    'events',
    'gathering_spots',
    'students',
    'staffs',
    'users',
    'class_rooms',
    'team_scores',
    'teams',
  ]) {
    await db.prepare(`DELETE FROM ${table}`).run();
  }
  const event = await db
    .prepare(
      "INSERT INTO events (event_name, start_time, end_time) VALUES ('〇人〇脚', '1000', '1200') RETURNING event_id"
    )
    .first<{ event_id: number }>();
  eventId = event!.event_id;
  spotIds = {};
  for (const name of ['体育館前', '中庭', '同名の場所', '同名の場所']) {
    const spot = await db
      .prepare(
        'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
      )
      .bind(name)
      .first<{ gathering_spot_id: number }>();
    spotIds[name] = spot!.gathering_spot_id;
  }
  const staffUserId = await insertUser('staff');
  await db
    .prepare('INSERT INTO staffs (user_id) VALUES (?)')
    .bind(staffUserId)
    .run();
  staffToken = await token(staffUserId);
  const [studentUserId] = await insertStudents('IH12A203', 4);
  await insertStudents('IH12B101', 2);
  studentToken = await token(studentUserId);
});

describe('POST /events/{eventId}/gathering-imports/preview', () => {
  it('ラウンド・集合時刻・集合場所が同じ行を1つの集合にまとめ、保存はしない', async () => {
    const body = [
      'グループ番号,ラウンド,開始時刻,集合時刻,集合場所,生徒',
      `1,1,10:00,9:45,体育館前,${teamsName('IH12A203', 1)}`,
      `1,1,10:00,09:45,体育館前,${teamsName('IH12A203', 2)}`,
      `2,1,10:00,9:50,中庭,${teamsName('IH12B101', 1)}`,
      ',,,,,',
    ].join('\n');

    const response = await preview('\uFEFF' + body);

    expect(response.status).toBe(200);
    const result = await response.json<Record<string, unknown>>();
    expect(result).toMatchObject({
      event_id: eventId,
      lock_version: await lockVersion(),
      total_rows: 3,
      imported_rows: 3,
      excluded_rows: 0,
      errors: [],
      warnings: [],
      rounds: [
        {
          round: 1,
          start_time: '1000',
          gatherings: [
            {
              gathering_time: '09:45',
              gathering_spot: { gathering_spot_name: '体育館前' },
              members: [
                {
                  row_number: 2,
                  class_code: 'IH12A203',
                  attendance_number: 1,
                },
                { row_number: 3, attendance_number: 2 },
              ],
            },
            {
              gathering_time: '09:50',
              gathering_spot: { gathering_spot_name: '中庭' },
              members: [{ row_number: 4, class_code: 'IH12B101' }],
            },
          ],
        },
      ],
    });
    expect(await savedGatherings()).toEqual([]);
  });

  it('エラーの行を理由ごとに返し、残りの行だけを取り込む結果にする', async () => {
    const response = await preview(
      csv(
        `x,10:00,9:45,体育館前,${teamsName('IH12A203', 1)}`,
        `1,10時,9:45,体育館前,${teamsName('IH12A203', 1)}`,
        `1,10:00,25:00,体育館前,${teamsName('IH12A203', 1)}`,
        `1,10:00,9:45,校庭,${teamsName('IH12A203', 1)}`,
        `1,10:00,9:45,同名の場所,${teamsName('IH12A203', 1)}`,
        '1,10:00,9:45,体育館前,名前なし',
        `1,10:00,9:45,体育館前,${teamsName('IH12A203', 9)}`,
        `2,11:00,10:45,体育館前,${teamsName('IH12A203', 1)}`,
        `2,11:00,10:45,中庭,${teamsName('IH12A203', 1)}`,
        `3,12:00,11:45,体育館前,${teamsName('IH12A203', 2)}`,
        `3,12:30,11:45,体育館前,${teamsName('IH12A203', 3)}`,
        `4,13:00,12:45,中庭,${teamsName('IH12A203', 4)}`
      )
    );

    const result = await response.json<{
      imported_rows: number;
      excluded_rows: number;
      errors: { row_number: number; code: string }[];
      rounds: { round: number }[];
    }>();
    expect(result.errors.map(error => [error.row_number, error.code])).toEqual([
      [2, 'INVALID_ROUND'],
      [3, 'INVALID_START_TIME'],
      [4, 'INVALID_GATHERING_TIME'],
      [5, 'GATHERING_SPOT_NOT_FOUND'],
      [6, 'GATHERING_SPOT_AMBIGUOUS'],
      [7, 'INVALID_STUDENT'],
      [8, 'STUDENT_NOT_FOUND'],
      [9, 'DUPLICATE_STUDENT'],
      [10, 'DUPLICATE_STUDENT'],
      [11, 'ROUND_START_TIME_MISMATCH'],
      [12, 'ROUND_START_TIME_MISMATCH'],
    ]);
    expect(result.imported_rows).toBe(1);
    expect(result.excluded_rows).toBe(11);
    expect(result.rounds.map(round => round.round)).toEqual([4]);
  });

  it('氏名が登録と違う行は取り込み、警告を返す。空白の有無は違いとみなさない', async () => {
    const response = await preview(
      csv(
        `1,,9:45,体育館前,NHIH12A20301 IH12A203生徒1`,
        `1,,9:45,体育館前,NHIH12A20302\u3000IH12A203 生徒2`,
        `1,,9:45,体育館前,NHIH12A20303 別人`,
        `1,,9:45,体育館前,NHIH12A20304`
      )
    );

    const result = await response.json<{
      imported_rows: number;
      warnings: { row_number: number; code: string; message: string }[];
      rounds: { start_time: string | null }[];
    }>();
    expect(result.imported_rows).toBe(4);
    expect(result.rounds[0].start_time).toBeNull();
    expect(result.warnings).toEqual([
      {
        row_number: 4,
        code: 'NAME_MISMATCH',
        message: '登録されている氏名は「IH12A203 生徒3」です',
        student: 'NHIH12A20303 別人',
        registered_name: 'IH12A203 生徒3',
      },
    ]);
  });

  it('番号の先頭がNH以外でも、末尾10文字でクラス記号と出席番号を読む', async () => {
    const result = await (
      await preview(csv('1,,9:45,体育館前,OSIH12A20301 IH12A203 生徒1'))
    ).json<{ imported_rows: number; errors: unknown[] }>();

    expect(result).toMatchObject({ imported_rows: 1, errors: [] });
  });

  it('途中に空行があっても、エラーの行番号はファイルの行番号のままにする', async () => {
    const result = await (
      await preview(
        [
          HEADER,
          `1,,9:45,体育館前,${teamsName('IH12A203', 1)}`,
          '',
          '1,,9:45,体育館前,名前なし',
        ].join('\n')
      )
    ).json<{ errors: { row_number: number }[] }>();

    expect(result.errors.map(error => error.row_number)).toEqual([4]);
  });

  it('同じ集合に同じ生徒が2回あるときも、その生徒の行をすべてエラーにする', async () => {
    const result = await (
      await preview(
        csv(
          `1,,9:45,体育館前,${teamsName('IH12A203', 1)}`,
          `1,,9:45,体育館前,${teamsName('IH12A203', 1)}`
        )
      )
    ).json<{ errors: { code: string }[] }>();

    expect(result.errors.map(error => error.code)).toEqual([
      'DUPLICATE_STUDENT',
      'DUPLICATE_STUDENT',
    ]);
  });

  it('同じラウンドで開始時刻が空欄の行と入力済みの行が混ざると、そのラウンドの行をすべてエラーにする', async () => {
    const result = await (
      await preview(
        csv(
          `1,,9:45,体育館前,${teamsName('IH12A203', 1)}`,
          `1,10:00,9:45,体育館前,${teamsName('IH12A203', 2)}`
        )
      )
    ).json<{ errors: { code: string }[] }>();

    expect(result.errors.map(error => error.code)).toEqual([
      'ROUND_START_TIME_MISMATCH',
      'ROUND_START_TIME_MISMATCH',
    ]);
  });

  it('2,500行を超えるファイルは400にする', async () => {
    const rows = Array.from(
      { length: 2501 },
      () => `1,,9:45,体育館前,${teamsName('IH12A203', 1)}`
    );

    const response = await preview(csv(...rows));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'GATHERING_IMPORT_TOO_MANY_ROWS' },
    });
  });

  it('退会した生徒は見つからない扱いにする', async () => {
    await db
      .prepare(
        "UPDATE users SET deletion_status = 'deleted' WHERE user_name = 'IH12A203 生徒1'"
      )
      .run();

    const result = await (
      await preview(csv(`1,,9:45,体育館前,${teamsName('IH12A203', 1)}`))
    ).json<{ errors: { code: string }[] }>();

    expect(result.errors.map(error => error.code)).toEqual([
      'STUDENT_NOT_FOUND',
    ]);
  });

  it('UTF-8でないファイルは400にする', async () => {
    // 「ラウンド」をShift_JISで書いたバイト列
    const shiftJis = new Uint8Array([
      0x83, 0x89, 0x83, 0x45, 0x83, 0x93, 0x83, 0x68,
    ]);

    const response = await preview(shiftJis);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_GATHERING_IMPORT_FILE' },
    });
  });

  it('必要な列が無いファイルは400にする', async () => {
    const response = await preview(
      'ラウンド,開始時刻,集合時刻,生徒\n1,10:00,9:45,NHIH12A20301 x'
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_GATHERING_IMPORT_FILE' },
    });
  });

  it('存在しない競技は404にする', async () => {
    eventId += 1000;

    const response = await preview(csv());

    expect(response.status).toBe(404);
  });
});

describe('POST /events/{eventId}/gathering-imports', () => {
  it('集合と参加者をCSVの内容に置き換え、エラーの行は除く', async () => {
    const first = await commit(
      csv(
        `1,10:00,9:45,体育館前,${teamsName('IH12A203', 1)}`,
        `1,10:00,9:45,体育館前,${teamsName('IH12A203', 2)}`,
        `1,10:00,9:50,中庭,${teamsName('IH12A203', 3)}`
      )
    );
    expect(first.status).toBe(200);
    const [kept, removed] = await savedGatherings();

    const response = await commit(
      csv(
        `1,10:30,9:45,体育館前,${teamsName('IH12A203', 2)}`,
        `1,10:30,9:45,体育館前,${teamsName('IH12B101', 1)}`,
        `2,11:00,10:45,中庭,${teamsName('IH12A203', 3)}`,
        `2,11:00,10:45,中庭,${teamsName('IH12A203', 9)}`
      )
    );

    expect(response.status).toBe(200);
    const result = await response.json<{
      lock_version: number;
      imported_rows: number;
      excluded_rows: number;
    }>();
    expect(result).toMatchObject({ imported_rows: 3, excluded_rows: 1 });
    expect(result.lock_version).toBe(await lockVersion());
    expect(await savedGatherings()).toEqual([
      {
        gathering_id: kept.gathering_id,
        round: 1,
        round_start_time: '1030',
        gathering_time: '09:45',
        gathering_spot_name: '体育館前',
        members: 'IH12A203 生徒2|IH12B101 生徒1',
      },
      expect.objectContaining({
        round: 2,
        round_start_time: '1100',
        gathering_time: '10:45',
        gathering_spot_name: '中庭',
        members: 'IH12A203 生徒3',
      }),
    ]);
    expect(
      (await savedGatherings()).map(gathering => gathering.gathering_id)
    ).not.toContain(removed.gathering_id);
  });

  it('CSVから消えた集合の未送信の自動通知を消し、残る集合の自動通知は残す', async () => {
    await commit(
      csv(
        `1,,9:45,体育館前,${teamsName('IH12A203', 1)}`,
        `1,,9:50,中庭,${teamsName('IH12A203', 2)}`
      )
    );
    const [kept, removed] = await savedGatherings();
    const scheduledFor = async (gatheringId: number) =>
      (await db
        .prepare(
          `SELECT COUNT(*) AS count FROM notification_schedules ns
             JOIN notifications n USING (notification_id)
             WHERE n.source_type = 'gathering' AND n.source_id = ?
               AND ns.send_status = 'scheduled'`
        )
        .bind(gatheringId)
        .first<{ count: number }>())!.count;
    expect(await scheduledFor(removed.gathering_id)).toBe(1);

    await commit(csv(`1,,9:45,体育館前,${teamsName('IH12A203', 1)}`));

    expect(await scheduledFor(removed.gathering_id)).toBe(0);
    expect(await scheduledFor(kept.gathering_id)).toBe(1);
  });

  it('100人を超える参加者を1つの集合に取り込める', async () => {
    await insertStudents('IH13C301', 99);
    const rows = Array.from(
      { length: 99 },
      (_, i) => `1,,9:45,体育館前,${teamsName('IH13C301', i + 1)}`
    );
    rows.push(
      ...[1, 2, 3, 4].map(
        number => `1,,9:45,体育館前,${teamsName('IH12A203', number)}`
      )
    );

    const response = await commit(csv(...rows));

    expect(response.status).toBe(200);
    const [gathering] = await savedGatherings();
    expect(gathering.members?.split('|')).toHaveLength(103);
  });

  it('プレビューのあとに集合設定が変わっていたら409にし、何も変えない', async () => {
    await commit(csv(`1,,9:45,体育館前,${teamsName('IH12A203', 1)}`));
    const before = await savedGatherings();
    const staleVersion = (await lockVersion()) - 1;

    const response = await commit(
      csv(`1,,9:50,中庭,${teamsName('IH12A203', 2)}`),
      staleVersion
    );

    expect(response.status).toBe(409);
    expect(await savedGatherings()).toEqual(before);
  });

  function envDeletingBeforeSave(sql: string): Env {
    const db = new Proxy(workerEnv.DB, {
      get(target, property) {
        if (property === 'batch') {
          return async (statements: D1PreparedStatement[]) => {
            await target.prepare(sql).run();
            return target.batch(statements);
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return { ...testEnv, DB: db };
  }

  it('確認から保存までの間に集合場所が削除されたら404にし、何も変えない', async () => {
    const response = await post(
      '/gathering-imports',
      csv(`1,,9:50,中庭,${teamsName('IH12A203', 1)}`),
      { lock_version: String(await lockVersion()) },
      staffToken,
      envDeletingBeforeSave(
        `DELETE FROM gathering_spots WHERE gathering_spot_id = ${spotIds['中庭']}`
      )
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'GATHERING_SPOT_NOT_FOUND' },
    });
    expect(await savedGatherings()).toEqual([]);
  });

  it('確認から保存までの間に競技が削除されたら404にする', async () => {
    const response = await post(
      '/gathering-imports',
      csv(`1,,9:50,中庭,${teamsName('IH12A203', 1)}`),
      { lock_version: String(await lockVersion()) },
      staffToken,
      envDeletingBeforeSave(`DELETE FROM events WHERE event_id = ${eventId}`)
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'EVENT_NOT_FOUND' },
    });
  });

  it('ラウンドが違っても、同じ競技で同じ生徒が複数の集合にいるときはその生徒の行をすべてエラーにする', async () => {
    const result = await (
      await preview(
        csv(
          `1,10:00,9:45,体育館前,${teamsName('IH12A203', 1)}`,
          `2,11:00,10:45,中庭,${teamsName('IH12A203', 1)}`
        )
      )
    ).json<{ errors: { code: string }[] }>();

    expect(result.errors.map(error => error.code)).toEqual([
      'DUPLICATE_STUDENT',
      'DUPLICATE_STUDENT',
    ]);
  });

  it('lock_version が無いときは400にし、何も変えない', async () => {
    const response = await post(
      '/gathering-imports',
      csv(`1,,9:45,体育館前,${teamsName('IH12A203', 1)}`)
    );

    expect(response.status).toBe(400);
    expect(await savedGatherings()).toEqual([]);
  });

  it('存在しない競技は404にする', async () => {
    eventId += 1000;

    const response = await commit(csv(), 0);

    expect(response.status).toBe(404);
  });

  it('取り込める行が1行も無いときは400にし、今の集合を消さない', async () => {
    await commit(csv(`1,,9:45,体育館前,${teamsName('IH12A203', 1)}`));
    const before = await savedGatherings();

    const response = await commit(csv('1,,9:45,体育館前,名前なし'));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'GATHERING_IMPORT_NO_ROWS' },
    });
    expect(await savedGatherings()).toEqual(before);
  });
});

describe('権限', () => {
  it.each([
    ['/gathering-imports/preview', {}],
    ['/gathering-imports', { lock_version: '0' }],
  ])('staff以外が %s を呼ぶと403にする', async (path, fields) => {
    const response = await post(
      path,
      csv(`1,,9:45,体育館前,${teamsName('IH12A203', 1)}`),
      fields,
      studentToken
    );

    expect(response.status).toBe(403);
    expect(await savedGatherings()).toEqual([]);
  });
});
