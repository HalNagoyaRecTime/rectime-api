import { env } from 'cloudflare:workers';
import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createStudentRepository } from '../../../src/infrastructure/repositories/StudentRepository';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';
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
      const students = result.items;

      expect(students).toHaveLength(seeded.students.length);
      expect(result.total).toBe(seeded.students.length);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      const numbers = students.map(s => s.studentIdNumber).sort();
      const expected = seeded.students.map(s => s.studentIdNumber).sort();
      expect(numbers).toEqual(expected);
    });

    it('limitとoffset未指定時はRepositoryのdefaultを返す', async () => {
      const result = await repo.findAll({});

      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
      expect(result.items).toHaveLength(seeded.students.length);
    });

    it('氏名・学籍番号・出席番号・クラスコード・クラス名を検索できる', async () => {
      const cases = [
        ['田中太郎', seeded.students[0].studentId],
        ['10001', seeded.students[1].studentId],
        ['4', seeded.students[3].studentId],
        ['TEST-2', seeded.students[3].studentId],
        ['別テスト教室', seeded.students[3].studentId],
      ] as const;

      for (const [search, studentId] of cases) {
        const result = await repo.findAll({ search });

        expect(result.total).toBe(1);
        expect(result.items.map(student => student.studentId)).toEqual([
          studentId,
        ]);
      }
    });

    it('classRoomIdで絞り込み、該当しないクラスは空一覧を返す', async () => {
      const result = await repo.findAll({
        classRoomId: seeded.secondClassRoomId,
      });
      expect(result.total).toBe(1);
      expect(result.items[0].studentId).toBe(seeded.students[3].studentId);

      await expect(repo.findAll({ classRoomId: 999999 })).resolves.toEqual({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      });
    });

    it('isStaffとisLiveActiveで絞り込む', async () => {
      const staff = await repo.findAll({ isStaff: true });
      expect(staff.items.map(student => student.studentId)).toEqual([
        seeded.students[2].studentId,
      ]);
      expect(staff.total).toBe(1);

      const nonStaff = await repo.findAll({ isStaff: false });
      expect(nonStaff.total).toBe(3);
      expect(nonStaff.items.every(student => !student.isStaff)).toBe(true);

      const active = await repo.findAll({ isLiveActive: true });
      expect(active.total).toBe(3);
      expect(active.items.every(student => student.isLiveActive)).toBe(true);

      const inactive = await repo.findAll({ isLiveActive: false });
      expect(inactive.items.map(student => student.studentId)).toEqual([
        seeded.students[1].studentId,
      ]);
    });

    it('退会処理中・退会済みの学生をtotalとページング対象から除外する', async () => {
      const usersToCreate = [
        {
          userName: '一覧除外確認-稼働中',
          isLiveActive: 1,
          deletionStatus: 'active',
          studentNumber: 'LIST-FILTER-ACTIVE',
        },
        {
          userName: '一覧除外確認-停止中',
          isLiveActive: 0,
          deletionStatus: 'active',
          studentNumber: 'LIST-FILTER-INACTIVE',
        },
        {
          userName: '一覧除外確認-削除処理中',
          isLiveActive: 1,
          deletionStatus: 'deletion_pending',
          studentNumber: 'LIST-FILTER-PENDING',
        },
        {
          userName: '一覧除外確認-削除済み',
          isLiveActive: 1,
          deletionStatus: 'deleted',
          studentNumber: 'LIST-FILTER-DELETED',
        },
      ] as const;
      const userIds: number[] = [];

      try {
        for (const userToCreate of usersToCreate) {
          const user = await env.DB.prepare(
            `INSERT INTO users (user_name, is_live_active, deletion_status)
             VALUES (?, ?, ?)
             RETURNING user_id`
          )
            .bind(
              userToCreate.userName,
              userToCreate.isLiveActive,
              userToCreate.deletionStatus
            )
            .first<{ user_id: number }>();
          if (!user) throw new Error('テスト用Userを作成できませんでした');
          userIds.push(user.user_id);
          await env.DB.prepare(
            'INSERT INTO students (user_id, student_id_number) VALUES (?, ?)'
          )
            .bind(user.user_id, userToCreate.studentNumber)
            .run();
        }

        const allActiveStatuses = await repo.findAll({
          search: '一覧除外確認',
          sortBy: 'studentId',
          limit: 1,
          offset: 1,
        });

        expect(allActiveStatuses.total).toBe(2);
        expect(
          allActiveStatuses.items.map(student => student.studentIdNumber)
        ).toEqual(['LIST-FILTER-INACTIVE']);

        const liveActiveStatuses = await repo.findAll({
          search: '一覧除外確認',
          isLiveActive: true,
        });
        expect(liveActiveStatuses.total).toBe(1);
        expect(
          liveActiveStatuses.items.map(student => student.studentIdNumber)
        ).toEqual(['LIST-FILTER-ACTIVE']);
      } finally {
        if (userIds.length > 0) {
          const placeholders = userIds.map(() => '?').join(', ');
          await env.DB.prepare(
            `DELETE FROM students WHERE user_id IN (${placeholders})`
          )
            .bind(...userIds)
            .run();
          await env.DB.prepare(
            `DELETE FROM users WHERE user_id IN (${placeholders})`
          )
            .bind(...userIds)
            .run();
        }
      }
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
    ] as const)('sortBy=%sは同値時にstudentId ascで安定する', async sortBy => {
      const baseline = await repo.findAll({ limit: 50, offset: 0 });
      const valueOf = (student: (typeof baseline.items)[number]) => {
        switch (sortBy) {
          case 'studentId':
            return student.studentId;
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
        }
      };
      const compare = (
        left: (typeof baseline.items)[number],
        right: (typeof baseline.items)[number],
        direction: 1 | -1
      ) => {
        const leftValue = valueOf(left);
        const rightValue = valueOf(right);
        if (leftValue === rightValue) {
          return left.studentId - right.studentId;
        }
        if (leftValue === null) return -1 * direction;
        if (rightValue === null) return 1 * direction;
        return (leftValue < rightValue ? -1 : 1) * direction;
      };

      for (const sortOrder of ['asc', 'desc'] as const) {
        const result = await repo.findAll({ sortBy, sortOrder });
        const expected = [...baseline.items].sort((left, right) =>
          compare(left, right, sortOrder === 'desc' ? -1 : 1)
        );

        expect(result.items.map(student => student.studentId)).toEqual(
          expected.map(student => student.studentId)
        );
      }
    });

    it('sortとpaginationの組み合わせでもstudentId ascのtie-breakerを維持する', async () => {
      const all = await repo.findAll({ sortBy: 'isStaff', sortOrder: 'asc' });
      const first = await repo.findAll({
        sortBy: 'isStaff',
        sortOrder: 'asc',
        limit: 1,
        offset: 0,
      });
      const second = await repo.findAll({
        sortBy: 'isStaff',
        sortOrder: 'asc',
        limit: 1,
        offset: 1,
      });

      expect(first.items[0].studentId).toBe(all.items[0].studentId);
      expect(second.items[0].studentId).toBe(all.items[1].studentId);
      expect(first.total).toBe(all.total);
      expect(second.total).toBe(all.total);
    });

    it('クラス未所属の学生も一覧と検索結果に含める', async () => {
      const user = await env.DB.prepare(
        'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
      )
        .bind('未所属検索対象')
        .first<{ user_id: number }>();
      const student = await env.DB.prepare(
        `INSERT INTO students (
          user_id,
          class_room_id,
          attendance_number,
          student_id_number
        ) VALUES (?, NULL, NULL, ?) RETURNING student_id`
      )
        .bind(user!.user_id, 'UNASSIGNED-SEARCH')
        .first<{ student_id: number }>();

      try {
        const result = await repo.findAll({ search: '未所属検索対象' });

        expect(result.items).toEqual([
          expect.objectContaining({
            studentId: student!.student_id,
            classRoomId: null,
            classRoomCode: null,
            classRoomName: null,
            attendanceNumber: null,
          }),
        ]);
      } finally {
        await env.DB.prepare('DELETE FROM students WHERE student_id = ?')
          .bind(student!.student_id)
          .run();
        await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
          .bind(user!.user_id)
          .run();
      }
    });
  });

  describe('findById', () => {
    it('students の id で学生を取得し、users を join して返す', async () => {
      const target = seeded.students[0];
      const student = await repo.findById(target.studentId);

      expect(student).toMatchObject({
        studentId: target.studentId,
        userId: target.userId,
        userName: target.displayName,
        attendanceNumber: target.attendanceNumber,
        studentIdNumber: target.studentIdNumber,
        classRoomId: target.classRoomId,
        classRoomCode: 'TEST-1',
        classRoomName: 'テスト教室',
        teamId: seeded.teamId,
        isLiveActive: true,
        isStaff: false,
      });
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });

    it.each(['deleted', 'deletion_pending'] as const)(
      '退会中(%s)の学生は null を返す',
      async deletionStatus => {
        const user = await env.DB.prepare(
          "INSERT INTO users (user_name, deletion_status) VALUES ('削除済みユーザー', ?) RETURNING user_id"
        )
          .bind(deletionStatus)
          .first<{ user_id: number }>();
        const student = await env.DB.prepare(
          'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, ?, ?) RETURNING student_id'
        )
          .bind(
            user!.user_id,
            seeded.students[0].classRoomId,
            deletionStatus === 'deleted' ? 91 : 92,
            `FIND-BY-ID-${deletionStatus}`
          )
          .first<{ student_id: number }>();

        await expect(repo.findById(student!.student_id)).resolves.toBeNull();
      }
    );

    it('students.updated_at を updatedAt として一覧・詳細の両方で返す', async () => {
      const target = seeded.students[0];
      const row = await env.DB.prepare(
        'SELECT updated_at FROM students WHERE student_id = ?'
      )
        .bind(target.studentId)
        .first<{ updated_at: string }>();

      expect((await repo.findById(target.studentId))?.updatedAt).toBe(
        row?.updated_at
      );
      const listed = (await repo.findAll({ limit: 100, offset: 0 })).items.find(
        item => item.studentId === target.studentId
      );
      expect(listed?.updatedAt).toBe(row?.updated_at);
      expect(listed?.lockVersion).toBe(0);
    });
  });

  describe('findByUserId', () => {
    it('users の id で学生を取得し、users を join して返す', async () => {
      const target = seeded.students[0];
      const student = await repo.findByUserId(target.userId);

      expect(student).toMatchObject({
        studentId: target.studentId,
        userId: target.userId,
        userName: target.displayName,
        attendanceNumber: target.attendanceNumber,
        studentIdNumber: target.studentIdNumber,
        classRoomId: target.classRoomId,
        classRoomCode: 'TEST-1',
        classRoomName: 'テスト教室',
        teamId: seeded.teamId,
        isLiveActive: true,
        isStaff: false,
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

      expect(student?.userName).toBe(target.displayName);
      expect(student?.userId).toBe(target.userId);
      expect(student?.studentIdNumber).toBe(target.studentIdNumber);
    });

    it('存在しない学籍番号の場合は null を返す', async () => {
      expect(await repo.findByStudentNum('00000')).toBeNull();
    });
  });

  describe('findByClassRoomAndAttendanceNumber', () => {
    it('クラスと出席番号で学生を取得できる', async () => {
      const target = seeded.students[0];

      await expect(
        repo.findByClassRoomAndAttendanceNumber(
          target.classRoomId,
          target.attendanceNumber
        )
      ).resolves.toMatchObject({ studentId: target.studentId });
    });

    it('該当する学生がいない場合はnullを返す', async () => {
      await expect(
        repo.findByClassRoomAndAttendanceNumber(seeded.classRoomId, 999)
      ).resolves.toBeNull();
    });
  });

  describe('create / update', () => {
    it('学生を作成、更新できる', async () => {
      const input = {
        displayName: '新規学生',
        classRoomId: seeded.classRoomId,
        attendanceNumber: 10,
        studentIdNumber: '10010',
      };
      const findByStudentNumSpy = vi.spyOn(repo, 'findByStudentNum');
      const created = await repo.create(input);

      expect(created).toMatchObject({
        userName: input.displayName,
        classRoomCode: 'TEST-1',
        classRoomName: 'テスト教室',
        teamId: seeded.teamId,
        isLiveActive: true,
        isStaff: false,
      });
      expect(findByStudentNumSpy).not.toHaveBeenCalled();

      const findByIdSpy = vi.spyOn(repo, 'findById');
      const updated = await repo.update(created.studentId, {
        ...input,
        displayName: '更新学生',
        attendanceNumber: 11,
      });
      expect(updated).toMatchObject({
        userName: '更新学生',
        attendanceNumber: 11,
        teamId: seeded.teamId,
      });
      expect(findByIdSpy).not.toHaveBeenCalled();
    });

    it('存在しない学生の更新は null を返す', async () => {
      await expect(
        repo.update(999999, {
          displayName: '存在しない学生',
          classRoomId: seeded.classRoomId,
          attendanceNumber: 99,
          studentIdNumber: '19999',
        })
      ).resolves.toBeNull();
    });

    describe('版番号による楽観ロック', () => {
      async function createStudent(
        studentIdNumber: string,
        attendanceNumber: number
      ) {
        const created = await repo.create({
          displayName: '版番号テスト',
          classRoomId: seeded.classRoomId,
          attendanceNumber,
          studentIdNumber,
        });
        return created.studentId;
      }

      const input = (
        studentIdNumber: string,
        displayName: string,
        attendanceNumber: number
      ) => ({
        displayName,
        classRoomId: seeded.classRoomId,
        attendanceNumber,
        studentIdNumber,
      });

      it('expectedLockVersion が現在の値と一致すれば更新し、lockVersion を1増やす', async () => {
        const id = await createStudent('LOCK-S1', 120);

        const updated = await repo.update(id, {
          ...input('LOCK-S1', '更新後', 121),
          expectedLockVersion: 0,
        });

        expect(updated).toMatchObject({
          userName: '更新後',
          attendanceNumber: 121,
          lockVersion: 1,
        });
      });

      it('expectedLockVersion が現在の値と異なれば null を返し、users も students も変更しない', async () => {
        const id = await createStudent('LOCK-S2', 122);

        const updated = await repo.update(id, {
          ...input('LOCK-S2', '上書きされてはいけない', 123),
          expectedLockVersion: 5,
        });

        expect(updated).toBeNull();
        await expect(repo.findById(id)).resolves.toMatchObject({
          userName: '版番号テスト',
          attendanceNumber: 122,
          lockVersion: 0,
        });
      });

      it('同じ版番号での2回の連続更新は、1回目だけ成功し2回目は競合する（同じ秒内でも）', async () => {
        const id = await createStudent('LOCK-S3', 124);

        const first = await repo.update(id, {
          ...input('LOCK-S3', 'Aの更新', 125),
          expectedLockVersion: 0,
        });
        const second = await repo.update(id, {
          ...input('LOCK-S3', 'Bの更新', 126),
          expectedLockVersion: 0,
        });

        expect(first).toMatchObject({ userName: 'Aの更新', lockVersion: 1 });
        expect(second).toBeNull();
        await expect(repo.findById(id)).resolves.toMatchObject({
          userName: 'Aの更新',
        });
      });

      it('expectedLockVersion を指定しない更新は版番号を確認せず、lockVersion は進む', async () => {
        const id = await createStudent('LOCK-S4', 127);

        const updated = await repo.update(id, input('LOCK-S4', '更新後', 128));

        expect(updated).toMatchObject({ userName: '更新後', lockVersion: 1 });
      });
    });

    it('クラス未所属の学生を作成し、所属情報なしで取得できる', async () => {
      const created = await repo.create({
        displayName: '未所属学生',
        classRoomId: null,
        attendanceNumber: null,
        studentIdNumber: 'UNASSIGNED-CREATE',
      });

      expect(created).toMatchObject({
        classRoomId: null,
        classRoomCode: null,
        classRoomName: null,
        attendanceNumber: null,
      });
      await expect(repo.findById(created.studentId)).resolves.toMatchObject({
        studentId: created.studentId,
        classRoomId: null,
        attendanceNumber: null,
      });
    });
  });

  describe('表示名の同期が学生の版に反映される', () => {
    it('学生を取得したあとに氏名が同期されると、古い版の学生PUTは競合し、新しい氏名が残る', async () => {
      const target = seeded.students[0];
      const fetched = await repo.findById(target.studentId);

      await createUserRepository(env.DB).updateUser({
        userId: String(target.userId),
        oid: 'oid-sync',
        tid: 'tid-sync',
        sub: 'sub-sync',
        email: 'sync@example.com',
        displayName: '同期された新しい氏名',
      });

      const updated = await repo.update(target.studentId, {
        displayName: fetched!.userName,
        classRoomId: fetched!.classRoomId,
        attendanceNumber: fetched!.attendanceNumber,
        studentIdNumber: fetched!.studentIdNumber,
        expectedLockVersion: fetched!.lockVersion,
      });

      expect(updated).toBeNull();
      expect((await repo.findById(target.studentId))?.userName).toBe(
        '同期された新しい氏名'
      );
    });
  });

  describe('updateClassRoom', () => {
    it('所属変更と未所属化ができる', async () => {
      const target = seeded.students[0];
      try {
        const moved = await repo.updateClassRoom(target.studentId, {
          classRoomId: seeded.secondClassRoomId,
          attendanceNumber: 20,
        });
        expect(moved).toMatchObject({
          classRoomId: seeded.secondClassRoomId,
          attendanceNumber: 20,
        });

        const unassigned = await repo.updateClassRoom(target.studentId, {
          classRoomId: null,
          attendanceNumber: null,
        });
        expect(unassigned).toMatchObject({
          classRoomId: null,
          classRoomCode: null,
          classRoomName: null,
          attendanceNumber: null,
        });
      } finally {
        await repo.updateClassRoom(target.studentId, {
          classRoomId: target.classRoomId,
          attendanceNumber: target.attendanceNumber,
        });
      }
    });

    it('存在しないStudentはnullを返す', async () => {
      await expect(
        repo.updateClassRoom(999999, {
          classRoomId: null,
          attendanceNumber: null,
        })
      ).resolves.toBeNull();
    });
  });

  describe('findExistingStudentsByNumbers', () => {
    it.each(['deletion_pending', 'deleted'] as const)(
      '退会状態が%sの学生は、退会済みとして返す',
      async deletionStatus => {
        const studentIdNumber = `EXISTING-${deletionStatus}`;
        const user = await env.DB.prepare(
          `INSERT INTO users (user_name, deletion_status)
           VALUES ('退会確認', ?)
           RETURNING user_id`
        )
          .bind(deletionStatus)
          .first<{ user_id: number }>();
        if (!user) throw new Error('テスト用Userを作成できませんでした');

        try {
          await env.DB.prepare(
            'INSERT INTO students (user_id, student_id_number) VALUES (?, ?)'
          )
            .bind(user.user_id, studentIdNumber)
            .run();

          const found = await repo.findExistingStudentsByNumbers([
            studentIdNumber,
          ]);

          expect(found.get(studentIdNumber)).toMatchObject({
            userId: user.user_id,
            isDeleted: true,
          });
        } finally {
          await env.DB.prepare('DELETE FROM students WHERE user_id = ?')
            .bind(user.user_id)
            .run();
          await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
            .bind(user.user_id)
            .run();
        }
      }
    );

    it('2,000件の候補から、DBに実在する学籍番号ごとの学生ID・ユーザーID・有効かどうかを、チャンク境界をまたいでもまとめて返す', async () => {
      const candidates = Array.from(
        { length: 2000 },
        (_, i) => `9${String(i).padStart(4, '0')}`
      );
      candidates[0] = seeded.students[0].studentIdNumber;
      candidates[150] = seeded.students[1].studentIdNumber;
      candidates[1999] = seeded.students[2].studentIdNumber;

      const existing = await repo.findExistingStudentsByNumbers(candidates);

      expect(existing).toEqual(
        new Map([
          [
            seeded.students[0].studentIdNumber,
            {
              studentId: seeded.students[0].studentId,
              userId: seeded.students[0].userId,
              isLiveActive: true,
              isDeleted: false,
            },
          ],
          [
            seeded.students[1].studentIdNumber,
            {
              studentId: seeded.students[1].studentId,
              userId: seeded.students[1].userId,
              isLiveActive: false,
              isDeleted: false,
            },
          ],
          [
            seeded.students[2].studentIdNumber,
            {
              studentId: seeded.students[2].studentId,
              userId: seeded.students[2].userId,
              isLiveActive: true,
              isDeleted: false,
            },
          ],
        ])
      );
    });

    it('候補が空配列の場合は空のMapを返す', async () => {
      expect(await repo.findExistingStudentsByNumbers([])).toEqual(new Map());
    });
  });

  describe('findExistingClassRoomAttendanceNumbers', () => {
    it('DBに存在するクラスコードと出席番号の組み合わせだけを返す', async () => {
      const target = seeded.students[0];

      const existing = await repo.findExistingClassRoomAttendanceNumbers([
        {
          classCode: 'TEST-1',
          attendanceNumber: target.attendanceNumber,
        },
        { classCode: 'TEST-1', attendanceNumber: 999 },
        {
          classCode: 'TEST-2',
          attendanceNumber: target.attendanceNumber,
        },
      ]);

      expect(existing).toEqual([
        {
          classCode: 'TEST-1',
          attendanceNumber: target.attendanceNumber,
        },
      ]);
    });

    it('候補が空配列の場合は空配列を返す', async () => {
      await expect(
        repo.findExistingClassRoomAttendanceNumbers([])
      ).resolves.toEqual([]);
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
        userName: '逆順生徒A',
        attendanceNumber: 18,
      });
      expect(await repo.findByStudentNum('ORDER-20001')).toMatchObject({
        userName: '逆順生徒B',
        attendanceNumber: 19,
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
        userName: '同姓同名生徒',
        attendanceNumber: 22,
      });
      expect(second).toMatchObject({
        userName: '同姓同名生徒',
        attendanceNumber: 23,
      });
      expect(first?.userId).not.toBe(second?.userId);
    });

    it('studentsの挿入が失敗した場合、直前に作成したnewClassRoomsとteamも残らない', async () => {
      await expect(
        repo.createMany({
          newClassRooms: [
            {
              classCode: 'PAIR-CLEANUP-NEW',
              className: 'PAIR-CLEANUP-NEW',
            },
          ],
          students: [
            {
              displayName: '後片付け確認対象の生徒',
              classCode: 'PAIR-CLEANUP-NEW',
              attendanceNumber: 24,
              // 既存のシード生徒と学籍番号を重複させ、students挿入をUNIQUE制約で失敗させる
              studentIdNumber: seeded.students[0].studentIdNumber,
            },
          ],
        })
      ).rejects.toThrow();

      const orphanedClassRoom = await env.DB.prepare(
        'SELECT class_room_id FROM class_rooms WHERE class_code = ?'
      )
        .bind('PAIR-CLEANUP-NEW')
        .first();
      expect(orphanedClassRoom).toBeNull();

      const orphanedTeam = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_name = ?'
      )
        .bind('PAIR-CLEANUP-NEW(PAIR-CLEANUP-NEW)')
        .first();
      expect(orphanedTeam).toBeNull();
    });

    it('既存クラスに複数の学生をまとめて作成する', async () => {
      await repo.createMany({
        newClassRooms: [],
        students: [
          {
            displayName: '一括生徒A',
            classCode: 'TEST-1',
            attendanceNumber: 220,
            studentIdNumber: '20000',
          },
          {
            displayName: '一括生徒B',
            classCode: 'TEST-1',
            attendanceNumber: 221,
            studentIdNumber: '20001',
          },
        ],
      });

      const a = await repo.findByStudentNum('20000');
      const b = await repo.findByStudentNum('20001');
      expect(a).toMatchObject({
        userName: '一括生徒A',
        classRoomName: 'テスト教室',
      });
      expect(b).toMatchObject({
        userName: '一括生徒B',
        classRoomName: 'テスト教室',
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
        userName: '一括生徒C',
        classRoomName: 'BULK-NEW',
      });
    });

    it('新規クラスのクラス名が重複していても作成できる（暫定チーム名はクラスコードで一意化される）', async () => {
      await repo.createMany({
        newClassRooms: [
          { classCode: 'DUP-NEW-A', className: '重複組' },
          { classCode: 'DUP-NEW-B', className: '重複組' },
        ],
        students: [
          {
            displayName: '一括生徒D',
            classCode: 'DUP-NEW-A',
            attendanceNumber: 1,
            studentIdNumber: '20003',
          },
          {
            displayName: '一括生徒E',
            classCode: 'DUP-NEW-B',
            attendanceNumber: 1,
            studentIdNumber: '20004',
          },
        ],
      });

      const createdD = await repo.findByStudentNum('20003');
      const createdE = await repo.findByStudentNum('20004');
      expect(createdD).toMatchObject({
        userName: '一括生徒D',
        classRoomName: '重複組',
      });
      expect(createdE).toMatchObject({
        userName: '一括生徒E',
        classRoomName: '重複組',
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
        userName: '一括生徒0',
        classRoomName: 'BULK2K-0',
        attendanceNumber: 1,
      });
      expect(middle).toMatchObject({
        userName: '一括生徒1000',
        classRoomName: 'BULK2K-0',
      });
      expect(last).toMatchObject({
        userName: '一括生徒1999',
        classRoomName: 'BULK2K-39',
      });
    });

    // CSV受付上限(MAX_IMPORT_ROW_COUNT = 2,500件)ぴったりでも、D1のdb.batch()
    // 1回あたりの文数上限(1000文)に触れずに作成できることを確認する。
    it('受付上限の2,500件の学生を、新規クラス100件とあわせてまとめて作成できる', async () => {
      const newClassRooms = Array.from({ length: 100 }, (_, i) => ({
        classCode: `BULK25-${i}`,
        className: `BULK25-${i}`,
      }));
      const students = Array.from({ length: 2500 }, (_, i) => ({
        displayName: `上限生徒${i}`,
        classCode: `BULK25-${i % 100}`,
        attendanceNumber: Math.floor(i / 100) + 1,
        studentIdNumber: `BULK25${String(i).padStart(5, '0')}`,
      }));

      await repo.createMany({ newClassRooms, students });

      const first = await repo.findByStudentNum('BULK2500000');
      const middle = await repo.findByStudentNum('BULK2501250');
      const last = await repo.findByStudentNum('BULK2502499');
      expect(first).toMatchObject({
        userName: '上限生徒0',
        classRoomName: 'BULK25-0',
        attendanceNumber: 1,
      });
      expect(middle).toMatchObject({
        userName: '上限生徒1250',
        classRoomName: 'BULK25-50',
      });
      expect(last).toMatchObject({
        userName: '上限生徒2499',
        classRoomName: 'BULK25-99',
      });
    });

    it('採番したuser_idを別経路が先に使っていた場合、採番し直して登録に成功する', async () => {
      const seed = await env.DB.prepare(
        'SELECT COALESCE(MAX(user_id), 0) AS max_user_id FROM users'
      ).first<{ max_user_id: number }>();
      const racedUserId = (seed?.max_user_id ?? 0) + 1;

      // createManyが1回目に採番するはずのuser_idを、通常ログイン等の
      // 別経路が先に使ったものとして直接挿入しておく
      await env.DB.prepare(
        'INSERT INTO users (user_id, user_name, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
      )
        .bind(racedUserId, '衝突させるための別ユーザー')
        .run();

      await repo.createMany({
        newClassRooms: [],
        students: [
          {
            displayName: 'リトライで登録されるはずの生徒',
            classCode: 'TEST-1',
            attendanceNumber: 40,
            studentIdNumber: 'RACE-RETRY-1',
          },
        ],
      });

      const created = await repo.findByStudentNum('RACE-RETRY-1');
      expect(created).toMatchObject({
        userName: 'リトライで登録されるはずの生徒',
      });
    });

    it('直前に作成したuserが削除され現存の最大値が下がっても、払い出し済みのuser_idを再利用しない', async () => {
      const deleted = await env.DB.prepare(
        "INSERT INTO users (user_name, updated_at) VALUES ('外部アカウント紐付け失敗で消される想定のユーザー', CURRENT_TIMESTAMP) RETURNING user_id"
      ).first<{ user_id: number }>();
      const deletedUserId = deleted!.user_id;
      // 通常ログイン経路で外部アカウントとの紐付けに失敗した際の後始末を模す。
      // AUTOINCREMENTの高水位(sqlite_sequence)はこの削除では下がらない。
      await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
        .bind(deletedUserId)
        .run();

      await repo.createMany({
        newClassRooms: [],
        students: [
          {
            displayName: '高水位維持確認用の生徒',
            classCode: 'TEST-1',
            attendanceNumber: 42,
            studentIdNumber: 'HWM-KEEP-1',
          },
        ],
      });

      const created = await repo.findByStudentNum('HWM-KEEP-1');
      expect(created?.userId).toBeGreaterThan(deletedUserId);
    });

    it('user_idの衝突が続く場合、既定回数リトライしたあとは例外を投げる', async () => {
      let batchCallCount = 0;
      const alwaysRacingDb = {
        prepare: (query: string) => env.DB.prepare(query),
        batch: async () => {
          batchCallCount++;
          throw new Error('D1_ERROR: UNIQUE constraint failed: users.user_id');
        },
      } as unknown as D1Database;
      const racingRepo = createStudentRepository(alwaysRacingDb);

      await expect(
        racingRepo.createMany({
          newClassRooms: [],
          students: [
            {
              displayName: '常に衝突する生徒',
              classCode: 'TEST-1',
              attendanceNumber: 41,
              studentIdNumber: 'RACE-GIVEUP-1',
            },
          ],
        })
      ).rejects.toThrow('users.user_id');

      // USER_ID_ALLOCATION_MAX_ATTEMPTSと同じ値。3回試して諦めること
      expect(batchCallCount).toBe(3);
    });

    it('新規クラスの一部がUNIQUE制約に違反する場合、他の新規クラス・生徒も含めて何も登録されない', async () => {
      const validClassRoom = {
        classCode: 'ATOMIC-NEW',
        className: 'ATOMIC-NEW',
      };
      const duplicateClassRoom = {
        // seedStudents で既に使われているclass_codeにぶつけて失敗させる
        classCode: 'TEST-1',
        className: '重複するクラス',
      };
      const students = [
        {
          displayName: '全体アトミック確認用の生徒',
          classCode: validClassRoom.classCode,
          attendanceNumber: 1,
          studentIdNumber: 'ATOMIC-CLEANUP-1',
        },
      ];

      await expect(
        repo.createMany({
          newClassRooms: [validClassRoom, duplicateClassRoom],
          students,
        })
      ).rejects.toThrow();

      // 新規クラス・チーム・生徒はすべて1回のdb.batch()にまとまっているため、
      // 一部が失敗すると何も登録されないこと
      const orphanedClassRoom = await env.DB.prepare(
        'SELECT class_room_id FROM class_rooms WHERE class_code = ?'
      )
        .bind(validClassRoom.classCode)
        .first();
      expect(orphanedClassRoom).toBeNull();

      const orphanedTeam = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_name = ?'
      )
        .bind('ATOMIC-NEW(ATOMIC-NEW)')
        .first();
      expect(orphanedTeam).toBeNull();

      expect(await repo.findByStudentNum('ATOMIC-CLEANUP-1')).toBeNull();
    });
  });

  describe('退会中の学生が使っている枠', () => {
    // 退会中の学生(退会したusersを指すstudents行)を、クラスと出席番号付きで作る
    async function insertDeletedStudent(
      classRoomId: number,
      attendanceNumber: number,
      studentIdNumber: string,
      deletionStatus: 'deleted' | 'deletion_pending' = 'deleted'
    ): Promise<number> {
      const user = await env.DB.prepare(
        "INSERT INTO users (user_name, deletion_status) VALUES ('削除済みユーザー', ?) RETURNING user_id"
      )
        .bind(deletionStatus)
        .first<{ user_id: number }>();
      const student = await env.DB.prepare(
        `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
         VALUES (?, ?, ?, ?) RETURNING student_id`
      )
        .bind(user!.user_id, classRoomId, attendanceNumber, studentIdNumber)
        .first<{ student_id: number }>();
      return student!.student_id;
    }

    async function readAssignment(studentId: number) {
      return env.DB.prepare(
        'SELECT class_room_id, attendance_number, lock_version FROM students WHERE student_id = ?'
      )
        .bind(studentId)
        .first<{
          class_room_id: number | null;
          attendance_number: number | null;
          lock_version: number;
        }>();
    }

    const released = {
      class_room_id: null,
      attendance_number: null,
      lock_version: 1,
    };

    it('重複確認では、退会中の学生が使っている枠を空きとして扱う', async () => {
      await insertDeletedStudent(seeded.classRoomId, 401, 'DELETED-SLOT-401');

      await expect(
        repo.findByClassRoomAndAttendanceNumber(seeded.classRoomId, 401)
      ).resolves.toBeNull();
      await expect(
        repo.findExistingClassRoomAttendanceNumbers([
          { classCode: 'TEST-1', attendanceNumber: 401 },
        ])
      ).resolves.toEqual([]);
    });

    it('create: 退会中の学生の枠に登録すると、退会中の学生のクラスと出席番号を外す', async () => {
      const deletedId = await insertDeletedStudent(
        seeded.classRoomId,
        402,
        'DELETED-SLOT-402'
      );

      const created = await repo.create({
        displayName: '枠を引き継ぐ学生',
        classRoomId: seeded.classRoomId,
        attendanceNumber: 402,
        studentIdNumber: 'TAKE-SLOT-402',
      });

      expect(created).toMatchObject({
        classRoomId: seeded.classRoomId,
        attendanceNumber: 402,
      });
      await expect(readAssignment(deletedId)).resolves.toEqual(released);
    });

    it('退会処理中の学生も退会中として扱い、枠を外す', async () => {
      const pendingId = await insertDeletedStudent(
        seeded.classRoomId,
        412,
        'PENDING-SLOT-412',
        'deletion_pending'
      );

      await expect(
        repo.findByClassRoomAndAttendanceNumber(seeded.classRoomId, 412)
      ).resolves.toBeNull();
      await repo.create({
        displayName: '処理中の枠を引き継ぐ学生',
        classRoomId: seeded.classRoomId,
        attendanceNumber: 412,
        studentIdNumber: 'TAKE-SLOT-412',
      });

      await expect(readAssignment(pendingId)).resolves.toEqual(released);
    });

    it('update: 退会中の学生の枠へ移すと、退会中の学生のクラスと出席番号を外す', async () => {
      const deletedId = await insertDeletedStudent(
        seeded.classRoomId,
        403,
        'DELETED-SLOT-403'
      );
      const target = await repo.create({
        displayName: '枠へ移る学生',
        classRoomId: seeded.classRoomId,
        attendanceNumber: 404,
        studentIdNumber: 'TAKE-SLOT-403',
      });

      const updated = await repo.update(target.studentId, {
        displayName: '枠へ移る学生',
        classRoomId: seeded.classRoomId,
        attendanceNumber: 403,
        studentIdNumber: 'TAKE-SLOT-403',
        expectedLockVersion: 0,
      });

      expect(updated).toMatchObject({ attendanceNumber: 403, lockVersion: 1 });
      await expect(readAssignment(deletedId)).resolves.toEqual(released);
    });

    it('update: 版番号が合わず更新されないときは、退会中の学生の枠も外さない', async () => {
      const deletedId = await insertDeletedStudent(
        seeded.classRoomId,
        405,
        'DELETED-SLOT-405'
      );
      const target = await repo.create({
        displayName: '競合する学生',
        classRoomId: seeded.classRoomId,
        attendanceNumber: 406,
        studentIdNumber: 'TAKE-SLOT-405',
      });

      const updated = await repo.update(target.studentId, {
        displayName: '競合する学生',
        classRoomId: seeded.classRoomId,
        attendanceNumber: 405,
        studentIdNumber: 'TAKE-SLOT-405',
        expectedLockVersion: 5,
      });

      expect(updated).toBeNull();
      await expect(readAssignment(deletedId)).resolves.toEqual({
        class_room_id: seeded.classRoomId,
        attendance_number: 405,
        lock_version: 0,
      });
      await expect(readAssignment(target.studentId)).resolves.toMatchObject({
        attendance_number: 406,
      });
    });

    it('updateClassRoom: 退会中の学生の枠へ移すと、退会中の学生のクラスと出席番号を外す', async () => {
      const deletedId = await insertDeletedStudent(
        seeded.secondClassRoomId,
        407,
        'DELETED-SLOT-407'
      );
      const target = await repo.create({
        displayName: 'クラスを移る学生',
        classRoomId: seeded.classRoomId,
        attendanceNumber: 408,
        studentIdNumber: 'TAKE-SLOT-407',
      });

      const moved = await repo.updateClassRoom(target.studentId, {
        classRoomId: seeded.secondClassRoomId,
        attendanceNumber: 407,
      });

      expect(moved).toMatchObject({
        classRoomId: seeded.secondClassRoomId,
        attendanceNumber: 407,
      });
      await expect(readAssignment(deletedId)).resolves.toEqual(released);
    });

    it('updateClassRoom: 対象の学生がいなければ、退会中の学生の枠も外さない', async () => {
      const deletedId = await insertDeletedStudent(
        seeded.classRoomId,
        409,
        'DELETED-SLOT-409'
      );

      await expect(
        repo.updateClassRoom(999999, {
          classRoomId: seeded.classRoomId,
          attendanceNumber: 409,
        })
      ).resolves.toBeNull();
      await expect(readAssignment(deletedId)).resolves.toMatchObject({
        class_room_id: seeded.classRoomId,
        attendance_number: 409,
      });
    });

    it('createMany: 退会中の学生の枠に取り込むと、退会中の学生のクラスと出席番号を外す', async () => {
      const deletedId = await insertDeletedStudent(
        seeded.classRoomId,
        410,
        'DELETED-SLOT-410'
      );
      const untouchedId = await insertDeletedStudent(
        seeded.classRoomId,
        411,
        'DELETED-SLOT-411'
      );

      await repo.createMany({
        newClassRooms: [],
        students: [
          {
            displayName: '取込で枠を引き継ぐ学生',
            classCode: 'TEST-1',
            attendanceNumber: 410,
            studentIdNumber: 'TAKE-SLOT-410',
          },
        ],
      });

      expect(await repo.findByStudentNum('TAKE-SLOT-410')).toMatchObject({
        classRoomId: seeded.classRoomId,
        attendanceNumber: 410,
      });
      await expect(readAssignment(deletedId)).resolves.toEqual(released);
      // 取り込む枠と関係のない退会中の学生は、所属を残したまま
      await expect(readAssignment(untouchedId)).resolves.toMatchObject({
        class_room_id: seeded.classRoomId,
        attendance_number: 411,
      });
    });

    it('在籍中の学生が使っている枠は外さず、一意制約で登録に失敗する', async () => {
      const active = seeded.students[0];

      await expect(
        repo.create({
          displayName: '在籍中の枠にぶつかる学生',
          classRoomId: active.classRoomId,
          attendanceNumber: active.attendanceNumber,
          studentIdNumber: 'TAKE-ACTIVE-SLOT',
        })
      ).rejects.toThrow('UNIQUE constraint failed');

      await expect(repo.findById(active.studentId)).resolves.toMatchObject({
        classRoomId: active.classRoomId,
        attendanceNumber: active.attendanceNumber,
      });
      expect(await repo.findByStudentNum('TAKE-ACTIVE-SLOT')).toBeNull();
    });
  });
});
