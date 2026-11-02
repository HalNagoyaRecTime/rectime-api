import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createStudentService } from '../../../src/application/services/StudentService';
import type { StudentImportRow } from '../../../src/application/dto/StudentDTO';
import { createStudentRepository } from '../../../src/infrastructure/repositories/StudentRepository';
import { createClassRoomRepository } from '../../../src/infrastructure/repositories/ClassRoomRepository';
import { seedStudents, type SeededData } from '../../fixtures/students';

type StudentRow = {
  student_id: number;
  user_id: number;
  user_name: string;
  is_live_active: number;
  class_code: string | null;
  attendance_number: number | null;
};

function newStudentRows(count: number): StudentImportRow[] {
  return Array.from({ length: count }, (_, i) => ({
    class_code: 'TEST-1',
    attendance_number: 10 + i,
    student_id_number: `${24001 + i}`,
    last_name: '新規',
    first_name: `${i + 1}`,
  }));
}

async function findStudentByNumber(
  studentIdNumber: string
): Promise<StudentRow | null> {
  return env.DB.prepare(
    `SELECT s.student_id, s.user_id, u.user_name, u.is_live_active,
            c.class_code, s.attendance_number
     FROM students s
     JOIN users u ON u.user_id = s.user_id
     LEFT JOIN class_rooms c ON c.class_room_id = s.class_room_id
     WHERE s.student_id_number = ?`
  )
    .bind(studentIdNumber)
    .first<StudentRow>();
}

async function countStudents(): Promise<number> {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS count FROM students'
  ).first<{ count: number }>();
  return row?.count ?? 0;
}

describe('学生の取込で既に登録されている学生を除外する', () => {
  let seeded: SeededData;
  const service = () =>
    createStudentService(
      createStudentRepository(env.DB),
      createClassRoomRepository(env.DB)
    );

  beforeEach(async () => {
    seeded = await seedStudents(env.DB);
  });

  it('既存学生1人と新規学生12人を取り込むと、新規学生12人だけが登録され、既存学生は変わらない', async () => {
    const existing = seeded.students[0];
    const rows = [
      {
        class_code: 'TEST-2',
        attendance_number: 30,
        student_id_number: existing.studentIdNumber,
        last_name: '別名',
        first_name: '太郎',
      },
      ...newStudentRows(12),
    ];
    const before = await findStudentByNumber(existing.studentIdNumber);
    const studentCountBefore = await countStudents();

    const validation = await service().validateStudentImport({ rows });
    const commit = await service().commitStudentImport({ rows });

    expect(validation).toMatchObject({
      total: 13,
      success_count: 12,
      error_count: 0,
      excluded_count: 1,
      excluded: [
        {
          row_index: 1,
          student_id_number: existing.studentIdNumber,
          student_id: existing.studentId,
          user_id: existing.userId,
          reason: 'student_already_registered',
        },
      ],
    });
    expect(commit).toEqual({
      total: 13,
      imported: 12,
      error_count: 0,
      errors: [],
    });
    expect(await countStudents()).toBe(studentCountBefore + 12);
    for (const row of newStudentRows(12)) {
      expect(await findStudentByNumber(row.student_id_number)).toMatchObject({
        user_name: `${row.last_name}${row.first_name}`,
        class_code: 'TEST-1',
        attendance_number: row.attendance_number,
      });
    }
    expect(await findStudentByNumber(existing.studentIdNumber)).toEqual(before);
  });

  it('無効化済みの学生は別の理由で除外し、有効化も新規作成もしない', async () => {
    const inactive = seeded.students[1];
    const rows = [
      {
        class_code: 'TEST-1',
        attendance_number: 2,
        student_id_number: inactive.studentIdNumber,
        last_name: '佐藤',
        first_name: '花子',
      },
      ...newStudentRows(1),
    ];
    const before = await findStudentByNumber(inactive.studentIdNumber);

    const validation = await service().validateStudentImport({ rows });
    const commit = await service().commitStudentImport({ rows });

    expect(validation.excluded).toEqual([
      expect.objectContaining({
        student_id: inactive.studentId,
        user_id: inactive.userId,
        reason: 'student_already_registered_inactive',
      }),
    ]);
    expect(commit.imported).toBe(1);
    expect(before?.is_live_active).toBe(0);
    expect(await findStudentByNumber(inactive.studentIdNumber)).toEqual(before);
  });

  it('除外する行にしか出てこないクラス記号では、クラスを作らない', async () => {
    const existing = seeded.students[0];
    const rows = [
      {
        class_code: 'ONLY-EXCLUDED',
        attendance_number: 1,
        student_id_number: existing.studentIdNumber,
        last_name: '田中',
        first_name: '太郎',
      },
      ...newStudentRows(1),
    ];

    await service().commitStudentImport({ rows });

    const classRoom = await env.DB.prepare(
      'SELECT class_room_id FROM class_rooms WHERE class_code = ?'
    )
      .bind('ONLY-EXCLUDED')
      .first();
    expect(classRoom).toBeNull();
  });

  it('除外する行のほかに直す必要があるエラーがあれば、1件も登録しない', async () => {
    const existing = seeded.students[0];
    const occupied = seeded.students[2];
    const rows = [
      {
        class_code: 'TEST-1',
        attendance_number: existing.attendanceNumber,
        student_id_number: existing.studentIdNumber,
        last_name: '田中',
        first_name: '太郎',
      },
      {
        class_code: 'TEST-1',
        attendance_number: occupied.attendanceNumber,
        student_id_number: '24100',
        last_name: '出席番号',
        first_name: '重複',
      },
      ...newStudentRows(1),
    ];
    const studentCountBefore = await countStudents();

    const commit = await service().commitStudentImport({ rows });

    expect(commit).toMatchObject({
      imported: 0,
      error_count: 1,
      errors: [
        expect.objectContaining({
          row_index: 2,
          reason: 'attendance_number_duplicate_in_db',
        }),
      ],
    });
    expect(await countStudents()).toBe(studentCountBefore);
  });
});
