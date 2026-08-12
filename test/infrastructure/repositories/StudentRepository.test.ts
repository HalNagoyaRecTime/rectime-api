import { env } from 'cloudflare:workers';
import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createStudentRepository } from '../../../src/infrastructure/repositories/StudentRepository';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import { seedStudents, type SeededData } from '../../fixtures/students';

function reverseBatchResultRows(db: D1Database): D1Database {
  return {
    prepare: query => db.prepare(query),
    batch: async <T = unknown>(statements: D1PreparedStatement[]) => {
      const results = await db.batch<T>(statements);
      return results.map(result => ({
        ...result,
        results: [...result.results].reverse(),
      }));
    },
  } as D1Database;
}

describe('StudentRepository', () => {
  let repo: IStudentRepository;
  let seeded: SeededData;

  beforeAll(async () => {
    // テストデータはtest/fixtures/students.ts で作成、挿入される。
    seeded = await seedStudents(env.DB);
    repo = createStudentRepository(env.DB);
  });

  describe('findAll', () => {
    it('students に登録されている学生を全件返す', async () => {
      const result = await repo.findAll({ limit: 50, offset: 0 });
      const students = result.students;

      expect(students).toHaveLength(seeded.students.length);
      expect(result.total).toBe(seeded.students.length);
      const numbers = students.map(s => s.student_id_number).sort();
      const expected = seeded.students.map(s => s.studentIdNumber).sort();
      expect(numbers).toEqual(expected);
    });
  });

  describe('findById', () => {
    it('students の id で学生を取得し、users を join して返す', async () => {
      const target = seeded.students[0];
      const student = await repo.findById(target.studentId);

      expect(student).toMatchObject({
        student_id: target.studentId,
        user_id: target.userId,
        user_name: target.displayName,
        attendance_number: target.attendanceNumber,
        student_id_number: target.studentIdNumber,
        class_room_id: target.classRoomId,
        class_room_name: 'テスト教室',
        is_live_active: true,
      });
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('users の id で学生を取得し、users を join して返す', async () => {
      const target = seeded.students[0];
      const student = await repo.findByUserId(target.userId);

      expect(student).toMatchObject({
        student_id: target.studentId,
        user_id: target.userId,
        user_name: target.displayName,
        attendance_number: target.attendanceNumber,
        student_id_number: target.studentIdNumber,
        class_room_id: target.classRoomId,
        class_room_name: 'テスト教室',
        is_live_active: true,
      });
    });

    it('存在しない userId の場合は null を返す', async () => {
      expect(await repo.findByUserId(999999)).toBeNull();
    });
  });

  describe('findByStudentNum', () => {
    it('学籍番号で学生を取得できる', async () => {
      const target = seeded.students[2];
      const student = await repo.findByStudentNum(target.studentIdNumber);

      expect(student?.user_name).toBe(target.displayName);
      expect(student?.user_id).toBe(target.userId);
      expect(student?.student_id_number).toBe(target.studentIdNumber);
    });

    it('存在しない学籍番号の場合は null を返す', async () => {
      expect(await repo.findByStudentNum('00000')).toBeNull();
    });
  });

  describe('create / update', () => {
    it('学生を作成、更新できる', async () => {
      const input = {
        display_name: '新規学生',
        class_room_id: seeded.classRoomId,
        attendance_number: 10,
        student_id_number: '10010',
      };
      const findByStudentNumSpy = vi.spyOn(repo, 'findByStudentNum');
      const created = await repo.create(input);

      expect(created).toMatchObject({
        user_name: input.display_name,
        class_room_name: 'テスト教室',
        is_live_active: true,
      });
      expect(findByStudentNumSpy).not.toHaveBeenCalled();

      const findByIdSpy = vi.spyOn(repo, 'findById');
      const updated = await repo.update(created.student_id, {
        ...input,
        display_name: '更新学生',
        attendance_number: 11,
      });
      expect(updated).toMatchObject({
        user_name: '更新学生',
        attendance_number: 11,
      });
      expect(findByIdSpy).not.toHaveBeenCalled();
    });

    it('存在しない学生の更新は null を返す', async () => {
      await expect(
        repo.update(999999, {
          display_name: '存在しない学生',
          class_room_id: seeded.classRoomId,
          attendance_number: 99,
          student_id_number: '19999',
        })
      ).resolves.toBeNull();
    });
  });

  describe('findExistingStudentNumbers', () => {
    it('2,000件の候補から、DBに実在する学籍番号だけをチャンク境界をまたいでもまとめて返す', async () => {
      const candidates = Array.from(
        { length: 2000 },
        (_, i) => `9${String(i).padStart(4, '0')}`
      );
      candidates[0] = seeded.students[0].studentIdNumber;
      candidates[150] = seeded.students[1].studentIdNumber;
      candidates[1999] = seeded.students[2].studentIdNumber;

      const existing = await repo.findExistingStudentNumbers(candidates);

      expect(existing).toEqual(
        new Set([
          seeded.students[0].studentIdNumber,
          seeded.students[1].studentIdNumber,
          seeded.students[2].studentIdNumber,
        ])
      );
    });

    it('候補が空配列の場合は空集合を返す', async () => {
      expect(await repo.findExistingStudentNumbers([])).toEqual(new Set());
    });
  });

  describe('createMany', () => {
    it('usersのRETURNING行が入力と逆順でも学生情報を正しく対応付ける', async () => {
      const reorderedRepo = createStudentRepository(
        reverseBatchResultRows(env.DB)
      );

      await reorderedRepo.createMany({
        newClassRooms: [],
        students: [
          {
            displayName: '逆順生徒A',
            classCode: 'TEST-1',
            attendanceNumber: 18,
            studentIdNumber: 'ORDER-20000',
          },
          {
            displayName: '逆順生徒B',
            classCode: 'TEST-1',
            attendanceNumber: 19,
            studentIdNumber: 'ORDER-20001',
          },
        ],
      });

      expect(await repo.findByStudentNum('ORDER-20000')).toMatchObject({
        user_name: '逆順生徒A',
        attendance_number: 18,
      });
      expect(await repo.findByStudentNum('ORDER-20001')).toMatchObject({
        user_name: '逆順生徒B',
        attendance_number: 19,
      });
    });

    it('同姓同名の学生にも異なるuser_idを対応付ける', async () => {
      await repo.createMany({
        newClassRooms: [],
        students: [
          {
            displayName: '同姓同名生徒',
            classCode: 'TEST-1',
            attendanceNumber: 22,
            studentIdNumber: 'SAME-NAME-20000',
          },
          {
            displayName: '同姓同名生徒',
            classCode: 'TEST-1',
            attendanceNumber: 23,
            studentIdNumber: 'SAME-NAME-20001',
          },
        ],
      });

      const first = await repo.findByStudentNum('SAME-NAME-20000');
      const second = await repo.findByStudentNum('SAME-NAME-20001');
      expect(first).toMatchObject({
        user_name: '同姓同名生徒',
        attendance_number: 22,
      });
      expect(second).toMatchObject({
        user_name: '同姓同名生徒',
        attendance_number: 23,
      });
      expect(first?.user_id).not.toBe(second?.user_id);
    });

    it('既存クラスに複数の学生をまとめて作成する', async () => {
      await repo.createMany({
        newClassRooms: [],
        students: [
          {
            displayName: '一括生徒A',
            classCode: 'TEST-1',
            attendanceNumber: 20,
            studentIdNumber: '20000',
          },
          {
            displayName: '一括生徒B',
            classCode: 'TEST-1',
            attendanceNumber: 21,
            studentIdNumber: '20001',
          },
        ],
      });

      const a = await repo.findByStudentNum('20000');
      const b = await repo.findByStudentNum('20001');
      expect(a).toMatchObject({
        user_name: '一括生徒A',
        class_room_name: 'テスト教室',
      });
      expect(b).toMatchObject({
        user_name: '一括生徒B',
        class_room_name: 'テスト教室',
      });
    });

    it('新規クラスの作成と学生の作成を同じbatchでまとめて行う', async () => {
      await repo.createMany({
        newClassRooms: [{ classCode: 'BULK-NEW', className: 'BULK-NEW' }],
        students: [
          {
            displayName: '一括生徒C',
            classCode: 'BULK-NEW',
            attendanceNumber: 1,
            studentIdNumber: '20002',
          },
        ],
      });

      const created = await repo.findByStudentNum('20002');
      expect(created).toMatchObject({
        user_name: '一括生徒C',
        class_room_name: 'BULK-NEW',
      });
    });

    it('一部の行が学籍番号のUNIQUE制約に違反する場合、他の行も含めて何も登録されない', async () => {
      await expect(
        repo.createMany({
          newClassRooms: [],
          students: [
            {
              displayName: '登録されないはずの生徒',
              classCode: 'TEST-1',
              attendanceNumber: 30,
              studentIdNumber: '20099',
            },
            {
              displayName: '既存と重複する生徒',
              classCode: 'TEST-1',
              attendanceNumber: 31,
              // seedStudents で既に使われている学籍番号
              studentIdNumber: seeded.students[0].studentIdNumber,
            },
          ],
        })
      ).rejects.toThrow();

      expect(await repo.findByStudentNum('20099')).toBeNull();

      const orphanedUsers = await env.DB.prepare(
        'SELECT user_id FROM users WHERE user_name IN (?, ?)'
      )
        .bind('登録されないはずの生徒', '既存と重複する生徒')
        .all();
      expect(orphanedUsers.results).toHaveLength(0);
    });

    it('studentsへの登録に失敗した場合、直前に作成したuserとnewClassRoomsも後片付けされる', async () => {
      await expect(
        repo.createMany({
          newClassRooms: [
            { classCode: 'CLEANUP-NEW', className: 'CLEANUP-NEW' },
          ],
          students: [
            {
              displayName: '後片付け対象の生徒',
              classCode: 'CLEANUP-MISSING',
              attendanceNumber: 1,
              studentIdNumber: '20098',
            },
          ],
        })
      ).rejects.toThrow();

      const orphanedUser = await env.DB.prepare(
        'SELECT user_id FROM users WHERE user_name = ?'
      )
        .bind('後片付け対象の生徒')
        .first();
      expect(orphanedUser).toBeNull();

      const orphanedClassRoom = await env.DB.prepare(
        'SELECT class_room_id FROM class_rooms WHERE class_code = ?'
      )
        .bind('CLEANUP-NEW')
        .first();
      expect(orphanedClassRoom).toBeNull();
    });

    it('[REPRO #215] 後片付け(deleteUsersByIds)自体が失敗すると元のエラーが握りつぶされる', async () => {
      const originalPrepare = env.DB.prepare.bind(env.DB);
      const prepareSpy = vi
        .spyOn(env.DB, 'prepare')
        .mockImplementation((sql: string) => {
          if (sql.startsWith('DELETE FROM users')) {
            throw new Error('DELETE_USERS_FAILED');
          }
          return originalPrepare(sql);
        });

      let thrown: unknown;
      try {
        await repo.createMany({
          newClassRooms: [{ classCode: 'REPRO-NEW', className: 'REPRO-NEW' }],
          students: [
            {
              displayName: '再現用生徒',
              classCode: 'REPRO-MISSING',
              attendanceNumber: 1,
              studentIdNumber: 'REPRO-1',
            },
          ],
        });
      } catch (error) {
        thrown = error;
      }

      prepareSpy.mockRestore();

      // 期待する挙動: deleteUsersByIds が失敗しても、元の students INSERT
      // 失敗のエラーが握りつぶされずに伝播すること
      expect(thrown).toBeInstanceOf(Error);
      expect((thrown as Error).message).not.toBe('DELETE_USERS_FAILED');

      // 期待する挙動: deleteUsersByIds が失敗しても deleteClassRoomsByCodes
      // は独立して実行され、newClassRooms の孤児レコードが残らないこと
      const orphanedClassRoom = await env.DB.prepare(
        'SELECT class_room_id FROM class_rooms WHERE class_code = ?'
      )
        .bind('REPRO-NEW')
        .first();
      expect(orphanedClassRoom).toBeNull();

      // 後片付け: 修正前の実行(孤児が残るケース)でも次のテストに
      // 影響しないよう掃除しておく
      await env.DB.prepare('DELETE FROM class_rooms WHERE class_code = ?')
        .bind('REPRO-NEW')
        .run();
    });

    it('2,000件の学生を、新規クラス40件とあわせてまとめて作成できる', async () => {
      const newClassRooms = Array.from({ length: 40 }, (_, i) => ({
        classCode: `BULK2K-${i}`,
        className: `BULK2K-${i}`,
      }));
      const students = Array.from({ length: 2000 }, (_, i) => ({
        displayName: `一括生徒${i}`,
        classCode: `BULK2K-${i % 40}`,
        attendanceNumber: Math.floor(i / 40) + 1,
        studentIdNumber: `BULK2K${String(i).padStart(5, '0')}`,
      }));

      await repo.createMany({ newClassRooms, students });

      const first = await repo.findByStudentNum('BULK2K00000');
      const middle = await repo.findByStudentNum('BULK2K01000');
      const last = await repo.findByStudentNum('BULK2K01999');
      expect(first).toMatchObject({
        user_name: '一括生徒0',
        class_room_name: 'BULK2K-0',
        attendance_number: 1,
      });
      expect(middle).toMatchObject({
        user_name: '一括生徒1000',
        class_room_name: 'BULK2K-0',
      });
      expect(last).toMatchObject({
        user_name: '一括生徒1999',
        class_room_name: 'BULK2K-39',
      });
    });
  });
});
