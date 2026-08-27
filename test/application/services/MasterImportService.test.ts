import { describe, expect, it, vi } from 'vitest';
import type {
  DurableObjectNamespace,
  KVNamespace,
} from '@cloudflare/workers-types';
import { createMasterImportService } from '../../../src/application/services/MasterImportService';
import { TTL_SECONDS } from '../../../src/infrastructure/masterImports/MasterImportStore';
import type { MasterImportCommitLock } from '../../../src/infrastructure/masterImports/MasterImportCommitLock';
import type { IStudentService } from '../../../src/application/services/IStudentService';
import type { IClassRoomService } from '../../../src/application/services/IClassRoomService';
import type { ITeacherService } from '../../../src/application/services/ITeacherService';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

const OWNER_USER_ID = 1;
const OTHER_USER_ID = 2;

function csvFile(content: string, name: string): File {
  return new File([content], name, { type: 'text/csv' });
}

function createFakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  } as unknown as KVNamespace;
}

function createFakeCommitLock(): DurableObjectNamespace<MasterImportCommitLock> {
  const tokens = new Map<string, string>();
  return {
    idFromName: (name: string) => name as never,
    get: (id: never) => {
      const name = String(id);
      return {
        tryBeginCommit: vi.fn(async () => {
          if (tokens.has(name)) {
            return null;
          }
          const token = crypto.randomUUID();
          tokens.set(name, token);
          return token;
        }),
        releaseLock: vi.fn(async (token: string) => {
          if (tokens.get(name) === token) {
            tokens.delete(name);
          }
        }),
      };
    },
  } as unknown as DurableObjectNamespace<MasterImportCommitLock>;
}

function buildStudentService(
  overrides: Partial<IStudentService> = {}
): IStudentService {
  return {
    getStudentById: vi.fn(),
    getByUserId: vi.fn(),
    getAllStudents: vi.fn(),
    createStudent: vi.fn(),
    updateStudent: vi.fn(),
    validateStudentImport: vi.fn(),
    commitStudentImport: vi.fn(),
    ...overrides,
  };
}

function buildClassRoomService(
  overrides: Partial<IClassRoomService> = {}
): IClassRoomService {
  return {
    getAllClassrooms: vi.fn(),
    getClassroomById: vi.fn(),
    createClassroom: vi.fn(),
    updateClassroom: vi.fn(),
    deleteClassroom: vi.fn(),
    validateClassRoomImport: vi.fn(),
    commitClassRoomImport: vi.fn(),
    ...overrides,
  };
}

function buildTeacherService(
  overrides: Partial<ITeacherService> = {}
): ITeacherService {
  return {
    createTeacher: vi.fn(),
    getTeacherById: vi.fn(),
    getAllTeachers: vi.fn(),
    updateTeacher: vi.fn(),
    validateTeacherImport: vi.fn(),
    commitTeacherImport: vi.fn(),
    ...overrides,
  };
}

function buildUserRepository(
  overrides: Partial<IUserRepository> = {}
): IUserRepository {
  return {
    exists: vi.fn(),
    isStaffOrTeacher: vi.fn().mockResolvedValue(true),
    isStaff: vi.fn().mockResolvedValue(true),
    getUserCategories: vi.fn(),
    findUserIdByMicrosoftAccount: vi.fn(),
    createUserWithMicrosoftLink: vi.fn(),
    updateUser: vi.fn(),
    linkMicrosoftAccount: vi.fn(),
    ...overrides,
  };
}

describe('MasterImportService', () => {
  describe('createImport', () => {
    it('学生のCSVを検査し、KVにvalidatedとして保存する', async () => {
      const kv = createFakeKv();
      const validateStudentImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const studentService = buildStudentService({ validateStudentImport });
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        studentService,
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        'students.csv'
      );

      const session = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'students',
        file,
        fileName: 'students.csv',
      });

      expect(session.status).toBe('validated');
      expect(session.type).toBe('students');
      expect(session.total).toBe(1);
      expect(session.error_count).toBe(0);
      expect(validateStudentImport).toHaveBeenCalledWith({
        rows: [
          {
            class_code: '11A',
            attendance_number: 1,
            student_id_number: '10001',
            last_name: '山田',
            first_name: '太郎',
          },
        ],
      });
      // セッション本体と墓標の2件を保存する
      expect(kv.put).toHaveBeenCalledTimes(2);
      expect(new Date(session.expires_at).getTime()).toBe(
        new Date(session.created_at).getTime() + TTL_SECONDS * 1000
      );
    });

    it('expires_atから、クライアントが残り時間を計算できる', async () => {
      const kv = createFakeKv();
      const validateClassRoomImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService({ validateClassRoomImport }),
        buildTeacherService(),
        buildUserRepository()
      );

      const session = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'classrooms',
        file: csvFile('class_code,class_name\n13A,A\n', 'c.csv'),
        fileName: 'c.csv',
      });

      // ISO8601として解釈でき、作成直後の残り時間はTTL以内の正の値になる
      expect(Number.isNaN(Date.parse(session.expires_at))).toBe(false);
      const remainingMs = new Date(session.expires_at).getTime() - Date.now();
      expect(remainingMs).toBeGreaterThan(0);
      expect(remainingMs).toBeLessThanOrEqual(TTL_SECONDS * 1000);
    });

    it('必須項目が欠けている行はエラーを投げ、KVには保存しない', async () => {
      const kv = createFakeKv();
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile('class_code,class_name\n,3年Cクラス\n', 'x.csv');

      await expect(
        service.createImport({
          createUserId: OWNER_USER_ID,
          type: 'classrooms',
          file,
          fileName: 'x.csv',
        })
      ).rejects.toThrow();
      expect(kv.put).not.toHaveBeenCalled();
    });
  });

  describe('getImport', () => {
    it('存在しないvalidatedFileIdはnullを返す', async () => {
      const kv = createFakeKv();
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      await expect(
        service.getImport('nope', { offset: 0, limit: 10 }, OWNER_USER_ID)
      ).resolves.toBeNull();
    });

    // デプロイ直後は、updated_atを持たない旧形式のセッションがKVに残りうる
    it('updated_atが無い旧形式のセッションはcreated_atを基準に算出する', async () => {
      const kv = createFakeKv();
      await kv.put(
        'master-import:legacy-1',
        JSON.stringify({
          validated_file_id: 'legacy-1',
          create_user_id: OWNER_USER_ID,
          type: 'classrooms',
          status: 'validated',
          file_name: 'c.csv',
          total: 0,
          success_count: 0,
          error_count: 0,
          errors: [],
          rows: [],
          created_at: '2026-08-20T00:00:00.000Z',
          committed_result: null,
        })
      );
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      const session = await service.getImport(
        'legacy-1',
        {
          offset: 0,
          limit: 10,
        },
        OWNER_USER_ID
      );

      expect(session?.expires_at).toBe('2026-08-20T00:30:00.000Z');
    });

    it('本体が期限切れで消えても、墓標が残っていればisExpiredImportがtrueを返す', async () => {
      const kv = createFakeKv();
      const validateClassRoomImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService({ validateClassRoomImport }),
        buildTeacherService(),
        buildUserRepository()
      );

      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'classrooms',
        file: csvFile('class_code,class_name\n13A,A\n', 'c.csv'),
        fileName: 'c.csv',
      });

      // TTL切れで本体だけが消えた状態を再現する（墓標はより長いTTLで残る）
      await kv.delete(`master-import:${created.validated_file_id}`);

      await expect(
        service.getImport(
          created.validated_file_id,
          { offset: 0, limit: 10 },
          OWNER_USER_ID
        )
      ).resolves.toBeNull();
      await expect(
        service.isExpiredImport(created.validated_file_id, OWNER_USER_ID)
      ).resolves.toBe(true);
      // 所有者が異なる場合は、実在したIDでもfalse（存在を漏らさない）
      await expect(
        service.isExpiredImport(created.validated_file_id, OTHER_USER_ID)
      ).resolves.toBe(false);
    });

    it('一度も存在しないIDはisExpiredImportがfalseを返す', async () => {
      const service = createMasterImportService(
        createFakeKv(),
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      await expect(
        service.isExpiredImport('nope', OWNER_USER_ID)
      ).resolves.toBe(false);
    });

    it('保存済みのセッションをoffset/limitでページ分けして返す', async () => {
      const kv = createFakeKv();
      const validateClassRoomImport = vi.fn().mockResolvedValue({
        total: 3,
        success_count: 3,
        error_count: 0,
        errors: [],
      });
      const classRoomService = buildClassRoomService({
        validateClassRoomImport,
      });
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        classRoomService,
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile(
        'class_code,class_name\n13A,A\n13B,B\n13C,C\n',
        'c.csv'
      );
      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'classrooms',
        file,
        fileName: 'c.csv',
      });

      const page = await service.getImport(
        created.validated_file_id,
        {
          offset: 1,
          limit: 1,
        },
        OWNER_USER_ID
      );

      expect(page?.rows).toEqual([{ class_code: '13B', class_name: 'B' }]);
      expect(page?.rows_total).toBe(3);
      expect(page?.expires_at).toBe(created.expires_at);
    });

    it('作成者と異なるuserIdでアクセスした場合はnullを返す', async () => {
      const kv = createFakeKv();
      const validateClassRoomImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const classRoomService = buildClassRoomService({
        validateClassRoomImport,
      });
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        classRoomService,
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile('class_code,class_name\n13A,A\n', 'c.csv');
      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'classrooms',
        file,
        fileName: 'c.csv',
      });

      await expect(
        service.getImport(
          created.validated_file_id,
          { offset: 0, limit: 10 },
          OTHER_USER_ID
        )
      ).resolves.toBeNull();
    });
  });

  describe('commitImport', () => {
    it('存在しないvalidatedFileIdはnot_foundを返す', async () => {
      const kv = createFakeKv();
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      await expect(
        service.commitImport('nope', OWNER_USER_ID)
      ).resolves.toEqual({
        status: 'not_found',
      });
    });

    it('エラー行がある場合はhas_errorsを返し、確定処理を呼ばない', async () => {
      const kv = createFakeKv();
      const validateTeacherImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const commitTeacherImport = vi.fn();
      const teacherService = buildTeacherService({
        validateTeacherImport,
        commitTeacherImport,
      });
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        teacherService,
        buildUserRepository()
      );

      // わざとバリデーション後にエラーが発生したセッションを模倣するため、
      // 検査結果自体にエラーがあるパターンをテストする
      validateTeacherImport.mockResolvedValueOnce({
        total: 1,
        success_count: 0,
        error_count: 1,
        errors: [{ row_index: 0, reason: 'dummy' }],
      });

      const file = csvFile('last_name,first_name\n田中,太郎\n', 't.csv');
      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'teachers',
        file,
        fileName: 't.csv',
      });

      const outcome = await service.commitImport(
        created.validated_file_id,
        OWNER_USER_ID
      );

      expect(outcome.status).toBe('has_errors');
      expect(commitTeacherImport).not.toHaveBeenCalled();
    });

    it('確定に成功した場合はcommittedを返し、KVをcommitted状態で更新する', async () => {
      const kv = createFakeKv();
      const validateStudentImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const commitStudentImport = vi.fn().mockResolvedValue({
        total: 1,
        imported: 1,
        error_count: 0,
        errors: [],
      });
      const studentService = buildStudentService({
        validateStudentImport,
        commitStudentImport,
      });
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        studentService,
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        's.csv'
      );
      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'students',
        file,
        fileName: 's.csv',
      });

      const outcome = await service.commitImport(
        created.validated_file_id,
        OWNER_USER_ID
      );

      expect(outcome.status).toBe('committed');
      expect(outcome.status === 'committed' && outcome.alreadyCommitted).toBe(
        false
      );
      expect(commitStudentImport).toHaveBeenCalledTimes(1);

      const second = await service.commitImport(
        created.validated_file_id,
        OWNER_USER_ID
      );
      expect(second.status).toBe('committed');
      expect(second.status === 'committed' && second.alreadyCommitted).toBe(
        true
      );
      // 二度目はDBへの書き込みを再実行しない
      expect(commitStudentImport).toHaveBeenCalledTimes(1);
    });

    // KVのexpirationTtlはputのたびに再カウントされるため、確定時の再保存で
    // 実際の有効期限は「確定時刻 + TTL」へ延びる。expires_atもそれに追随させる。
    it('確定後のexpires_atは、確定時刻を基準に再計算される', async () => {
      vi.useFakeTimers();
      try {
        const kv = createFakeKv();
        const validateStudentImport = vi.fn().mockResolvedValue({
          total: 1,
          success_count: 1,
          error_count: 0,
          errors: [],
        });
        const commitStudentImport = vi.fn().mockResolvedValue({
          total: 1,
          imported: 1,
          error_count: 0,
          errors: [],
        });
        const service = createMasterImportService(
          kv,
          createFakeCommitLock(),
          buildStudentService({ validateStudentImport, commitStudentImport }),
          buildClassRoomService(),
          buildTeacherService(),
          buildUserRepository()
        );

        vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z'));
        const created = await service.createImport({
          createUserId: OWNER_USER_ID,
          type: 'students',
          file: csvFile(
            'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
            's.csv'
          ),
          fileName: 's.csv',
        });
        expect(created.expires_at).toBe('2026-08-20T00:30:00.000Z');

        // 作成から25分後に確定する（残り5分の状態でKVが再保存される）
        vi.setSystemTime(new Date('2026-08-20T00:25:00.000Z'));
        const outcome = await service.commitImport(
          created.validated_file_id,
          OWNER_USER_ID
        );

        expect(
          outcome.status === 'committed' && outcome.session.expires_at
        ).toBe('2026-08-20T00:55:00.000Z');

        // 再取得しても、延長後の期限が返る（updated_atがKVに永続化されている）
        const fetched = await service.getImport(
          created.validated_file_id,
          {
            offset: 0,
            limit: 10,
          },
          OWNER_USER_ID
        );
        expect(fetched?.expires_at).toBe('2026-08-20T00:55:00.000Z');
        expect(fetched?.created_at).toBe('2026-08-20T00:00:00.000Z');
      } finally {
        vi.useRealTimers();
      }
    });

    it('ほぼ同時に確定リクエストが2回来ても、確定処理は1回しか実行されない', async () => {
      const kv = createFakeKv();
      const commitLock = createFakeCommitLock();
      const validateStudentImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const commitStudentImport = vi.fn().mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  total: 1,
                  imported: 1,
                  error_count: 0,
                  errors: [],
                }),
              10
            )
          )
      );
      const studentService = buildStudentService({
        validateStudentImport,
        commitStudentImport,
      });
      const service = createMasterImportService(
        kv,
        commitLock,
        studentService,
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        's.csv'
      );
      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'students',
        file,
        fileName: 's.csv',
      });

      const [first, second] = await Promise.all([
        service.commitImport(created.validated_file_id, OWNER_USER_ID),
        service.commitImport(created.validated_file_id, OWNER_USER_ID),
      ]);

      expect(commitStudentImport).toHaveBeenCalledTimes(1);
      const alreadyCommittedFlags = [first, second].map(
        outcome => outcome.status === 'committed' && outcome.alreadyCommitted
      );
      expect(alreadyCommittedFlags.sort()).toEqual([false, true]);
    });

    it('確定処理の実行時点で新たにエラーが見つかった場合はcommittedにせず、再試行できる状態にする', async () => {
      const kv = createFakeKv();
      const commitLock = createFakeCommitLock();
      const validateStudentImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const commitStudentImport = vi
        .fn()
        .mockResolvedValueOnce({
          total: 1,
          imported: 0,
          error_count: 1,
          errors: [
            {
              row_index: 0,
              reason: 'student_id_number_duplicate_in_db',
            },
          ],
        })
        .mockResolvedValueOnce({
          total: 1,
          imported: 1,
          error_count: 0,
          errors: [],
        });
      const studentService = buildStudentService({
        validateStudentImport,
        commitStudentImport,
      });
      const service = createMasterImportService(
        kv,
        commitLock,
        studentService,
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        's.csv'
      );
      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'students',
        file,
        fileName: 's.csv',
      });

      const outcome = await service.commitImport(
        created.validated_file_id,
        OWNER_USER_ID
      );
      expect(outcome.status).toBe('has_errors');
      if (outcome.status === 'has_errors') {
        expect(outcome.session.error_count).toBe(1);
        expect(outcome.session.errors).toEqual([
          expect.objectContaining({
            reason: 'student_id_number_duplicate_in_db',
          }),
        ]);
      }

      // committedとして固定されていないので、修正後にもう一度確定できる
      const retried = await service.commitImport(
        created.validated_file_id,
        OWNER_USER_ID
      );
      expect(retried.status).toBe('committed');
      expect(retried.status === 'committed' && retried.alreadyCommitted).toBe(
        false
      );
      expect(commitStudentImport).toHaveBeenCalledTimes(2);
    });

    it('先行する確定処理がいつまでも終わらない場合は、例外を投げずtimeoutを返す', async () => {
      const kv = createFakeKv();
      const commitLock = createFakeCommitLock();
      const studentService = buildStudentService({
        validateStudentImport: vi.fn().mockResolvedValue({
          total: 1,
          success_count: 1,
          error_count: 0,
          errors: [],
        }),
      });
      const service = createMasterImportService(
        kv,
        commitLock,
        studentService,
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        's.csv'
      );
      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'students',
        file,
        fileName: 's.csv',
      });

      // 先にロックを取得し、意図的に解放しないことで「先行する確定処理が
      // 終わらない」状況を再現する。
      await commitLock
        .get(commitLock.idFromName(created.validated_file_id))
        .tryBeginCommit();

      const outcome = await service.commitImport(
        created.validated_file_id,
        OWNER_USER_ID
      );
      expect(outcome).toEqual({ status: 'timeout' });
    }, 10000);

    it('作成者と異なるuserIdで確定しようとした場合はnot_foundを返す', async () => {
      const kv = createFakeKv();
      const validateStudentImport = vi.fn().mockResolvedValue({
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      });
      const commitStudentImport = vi.fn();
      const studentService = buildStudentService({
        validateStudentImport,
        commitStudentImport,
      });
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        studentService,
        buildClassRoomService(),
        buildTeacherService(),
        buildUserRepository()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        's.csv'
      );
      const created = await service.createImport({
        createUserId: OWNER_USER_ID,
        type: 'students',
        file,
        fileName: 's.csv',
      });

      await expect(
        service.commitImport(created.validated_file_id, OTHER_USER_ID)
      ).resolves.toEqual({ status: 'not_found' });
      expect(commitStudentImport).not.toHaveBeenCalled();
    });
  });
});
