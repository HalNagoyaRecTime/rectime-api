import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import type {
  StudentEntity,
  StudentSearchFilter,
} from '../../../src/domain/entities/Student';
import { createStudentRepository } from '../../../src/infrastructure/repositories/StudentRepository';
import { createReadCountingDb } from '../../readCountingDb';

const STUDENTS = 1000;
const CLASS_ROOMS = 20;
const SEQ = `WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < ${STUDENTS - 1})`;

async function seed() {
  await env.DB.batch(
    ['staffs', 'students', 'class_rooms', 'teams', 'users'].map(table =>
      env.DB.prepare(`DELETE FROM ${table}`)
    )
  );
  await env.DB.batch([
    env.DB.prepare(
      `${SEQ} INSERT INTO teams (team_name) SELECT 'team' || n FROM seq WHERE n < ${CLASS_ROOMS}`
    ),
    env.DB.prepare(
      `${SEQ} INSERT INTO class_rooms (class_code, class_name, team_id)
       SELECT 'IH' || printf('%02d', n), 'クラス' || (n % 7), team_id
       FROM seq JOIN teams ON team_name = 'team' || n
       WHERE n < ${CLASS_ROOMS}`
    ),
    env.DB.prepare(
      `${SEQ} INSERT INTO users (user_name, is_live_active, deletion_status)
       SELECT '生徒' || (n % 300),
              CASE WHEN n % 7 = 0 THEN 0 ELSE 1 END,
              CASE WHEN n % 97 = 0 THEN 'deleted' ELSE 'active' END
       FROM seq`
    ),
    env.DB.prepare(
      `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
       SELECT user_id,
              CASE WHEN user_id % 41 = 0 THEN NULL
                   ELSE (SELECT class_room_id FROM class_rooms
                         WHERE class_code = 'IH' || printf('%02d', user_id % ${CLASS_ROOMS})) END,
              CASE WHEN user_id % 41 = 0 THEN NULL ELSE user_id / ${CLASS_ROOMS} + 1 END,
              'S' || printf('%05d', (user_id * 37) % 100003)
       FROM users ORDER BY user_id`
    ),
    env.DB.prepare(
      'INSERT INTO staffs (user_id) SELECT user_id FROM users WHERE user_id % 50 = 0'
    ),
  ]);
}

function sortValue(
  student: StudentEntity,
  sortBy: StudentSearchFilter['sortBy']
): string | number | null {
  switch (sortBy) {
    case 'studentIdNumber':
      return student.studentIdNumber;
    case 'displayName':
      return student.userName;
    case 'classCode':
      return student.classRoomCode;
    case 'className':
      return student.classRoomName;
    case 'attendanceNumber':
      return student.attendanceNumber;
    case 'isStaff':
      return Number(student.isStaff);
    case 'isLiveActive':
      return Number(student.isLiveActive);
    default:
      return student.studentId;
  }
}

function expectedPage(
  everyone: StudentEntity[],
  filter: StudentSearchFilter
): { ids: number[]; total: number } {
  const search = filter.search;
  const matched = everyone.filter(
    student =>
      (search === undefined ||
        [
          student.userName,
          student.studentIdNumber,
          student.attendanceNumber?.toString(),
          student.classRoomCode,
          student.classRoomName,
        ].some(value => value?.includes(search))) &&
      (filter.classRoomId === undefined ||
        student.classRoomId === filter.classRoomId) &&
      (filter.isLiveActive === undefined ||
        student.isLiveActive === filter.isLiveActive) &&
      (filter.isStaff === undefined || student.isStaff === filter.isStaff)
  );
  const direction = filter.sortOrder === 'desc' ? -1 : 1;
  const sorted = [...matched].sort((left, right) => {
    const leftValue = sortValue(left, filter.sortBy);
    const rightValue = sortValue(right, filter.sortBy);
    if (leftValue === rightValue) return left.studentId - right.studentId;
    if (leftValue === null) return -direction;
    if (rightValue === null) return direction;
    return (leftValue < rightValue ? -1 : 1) * direction;
  });
  const offset = filter.offset ?? 0;
  return {
    ids: sorted
      .slice(offset, offset + (filter.limit ?? 50))
      .map(student => student.studentId),
    total: matched.length,
  };
}

describe('学生一覧のD1読み取り行数', () => {
  const counting = createReadCountingDb();
  const repo = createStudentRepository(counting.db);
  let everyone: StudentEntity[];

  beforeAll(async () => {
    await seed();
    const rows = await env.DB.prepare(
      `SELECT s.student_id, s.user_id, u.user_name, s.class_room_id,
              c.class_code, c.class_name, c.team_id, s.attendance_number,
              s.student_id_number, u.is_live_active, st.staff_id,
              s.updated_at, s.lock_version
       FROM students s
       JOIN users u ON u.user_id = s.user_id
       LEFT JOIN class_rooms c ON c.class_room_id = s.class_room_id
       LEFT JOIN staffs st ON st.user_id = u.user_id
       WHERE u.deletion_status = 'active'
       ORDER BY s.student_id`
    ).all<Record<string, number | string | null>>();
    everyone = rows.results.map(row => ({
      studentId: row.student_id as number,
      userId: row.user_id as number,
      userName: row.user_name as string,
      classRoomId: row.class_room_id as number | null,
      classRoomCode: row.class_code as string | null,
      classRoomName: row.class_name as string | null,
      teamId: row.team_id as number | null,
      attendanceNumber: row.attendance_number as number | null,
      studentIdNumber: row.student_id_number as string,
      isLiveActive: row.is_live_active === 1,
      isStaff: row.staff_id !== null,
      updatedAt: row.updated_at as string,
      lockVersion: row.lock_version as number,
    }));
  });

  it.each([
    ['学生一覧の1ページ目', { limit: 50, offset: 0, isLiveActive: true }],
    ['学生一覧の2ページ目', { limit: 50, offset: 50, isLiveActive: true }],
    ['全員を100件ずつ取る途中のページ', { limit: 100, offset: 300 }],
    ['該当が1ページに収まる検索', { search: 'S0003', limit: 50, offset: 0 }],
  ] as [string, StudentSearchFilter][])(
    '%sは生徒1人あたり2行と取得位置までの1件あたり4行しか読まない',
    async (_, filter) => {
      counting.reset();
      await repo.findAll(filter);

      expect(counting.rowsRead()).toBeLessThanOrEqual(
        STUDENTS * 2 + ((filter.offset ?? 0) + (filter.limit ?? 50)) * 4
      );
    }
  );

  it.each([
    ['1ページ目', { limit: 100, offset: 0 }],
    ['途中のページ', { limit: 100, offset: 300 }],
    [
      '有効な生徒だけの途中のページ',
      { limit: 100, offset: 300, isLiveActive: true },
    ],
  ] as [string, StudentSearchFilter][])(
    'includeTotal=falseの%sは件数を数えず、取得位置までの1件あたり4行しか読まない',
    async (_, filter) => {
      counting.reset();
      const result = await repo.findAll({ ...filter, includeTotal: false });

      expect(result.items).toHaveLength(100);
      expect(result.total).toBeUndefined();
      expect(counting.rowsRead()).toBeLessThanOrEqual(
        (filter.offset! + filter.limit!) * 4
      );
    }
  );

  it.each([
    ['limit未満で終わる最後のページ', () => everyone.length - 50],
    ['ちょうどlimit件で終わる最後のページ', () => everyone.length - 100],
  ] as [string, () => number][])(
    'includeTotal=falseの%sは件数を数えず、全員を並べた最後の部分を返す',
    async (_, offsetOf) => {
      const query = { limit: 100, offset: offsetOf() };
      counting.reset();
      const result = await repo.findAll({ ...query, includeTotal: false });

      expect(result.items.map(student => student.studentId)).toEqual(
        expectedPage(everyone, query).ids
      );
      expect(result.total).toBeUndefined();
      expect(counting.rowsRead()).toBeLessThanOrEqual(
        (query.offset + query.limit) * 4
      );
    }
  );

  it.each(['studentId', 'displayName'] as const)(
    '停止中の生徒だけをsortBy=%sで選ぶときは生徒数ぶんを読まない',
    async sortBy => {
      counting.reset();
      await repo.findAll({ isLiveActive: false, sortBy, limit: 50 });

      expect(counting.rowsRead()).toBeLessThan(STUDENTS);
    }
  );

  it('クラスで絞り込んだ一覧は生徒数によらずクラスの人数ぶんしか読まない', async () => {
    const classRoomId = everyone.find(
      s => s.classRoomId !== null
    )!.classRoomId!;

    counting.reset();
    await repo.findAll({
      classRoomId,
      limit: 10,
      sortBy: 'attendanceNumber',
    });

    expect(counting.rowsRead()).toBeLessThan((STUDENTS / CLASS_ROOMS) * 5);
  });

  it.each([
    'studentId',
    'studentIdNumber',
    'displayName',
    'classCode',
    'className',
    'attendanceNumber',
    'isStaff',
    'isLiveActive',
  ] as const)(
    'sortBy=%sで絞り込み・検索・ページ送りを組み合わせても全件を並べた結果と一致する',
    async sortBy => {
      const filters: StudentSearchFilter[] = [
        { limit: 100, offset: 0 },
        { limit: 100, offset: 900 },
        { limit: 30, offset: 60, isLiveActive: false },
        { limit: 50, offset: 0, isStaff: true },
        { limit: 50, offset: 100, isStaff: false, isLiveActive: true },
        { limit: 50, offset: 0, classRoomId: everyone[3].classRoomId! },
        { limit: 50, offset: 0, search: 'クラス3' },
        { limit: 10, offset: 20, search: 'IH0' },
        { limit: 50, offset: 0, search: '生徒12' },
        { limit: 50, offset: 0, search: '1' },
        { limit: 50, offset: 0, search: '該当なし' },
        { limit: 50, offset: 5000 },
        { limit: everyone.length - 900, offset: 900 },
        { limit: 50, offset: everyone.length },
      ];
      for (const filter of filters) {
        for (const sortOrder of ['asc', 'desc'] as const) {
          const query = { ...filter, sortBy, sortOrder };
          const result = await repo.findAll(query);
          const withoutTotal = await repo.findAll({
            ...query,
            includeTotal: false,
          });
          const expected = expectedPage(everyone, query);

          expect(
            {
              ids: result.items.map(student => student.studentId),
              total: result.total,
            },
            JSON.stringify(query)
          ).toEqual(expected);
          expect(withoutTotal.items, JSON.stringify(query)).toEqual(
            result.items
          );
          expect(withoutTotal.total).toBeUndefined();
        }
      }
      expect(everyone.some(student => student.classRoomId === null)).toBe(true);
    }
  );

  it('一覧の各項目は1件ずつ取得した学生と同じ値を返す', async () => {
    const plainRepo = createStudentRepository(env.DB);
    const result = await repo.findAll({ limit: 100, offset: 0 });
    const fetchedOneByOne = await Promise.all(
      result.items.map(student => plainRepo.findById(student.studentId))
    );

    expect(result.items).toEqual(fetchedOneByOne);
    expect(result.items).toEqual(everyone.slice(0, 100));
  });
});
