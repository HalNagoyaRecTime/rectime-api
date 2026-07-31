import { describe, expect, it, vi } from 'vitest';
import type {
  DurableObjectNamespace,
  KVNamespace,
} from '@cloudflare/workers-types';
import { createMasterImportService } from '../../../src/application/services/MasterImportService';
import type { MasterImportCommitLock } from '../../../src/infrastructure/masterImports/MasterImportCommitLock';
import type { IStudentService } from '../../../src/application/services/IStudentService';
import type { IClassRoomService } from '../../../src/application/services/IClassRoomService';
import type { ITeacherService } from '../../../src/application/services/ITeacherService';

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
  const committing = new Set<string>();
  return {
    idFromName: (name: string) => name as never,
    get: (id: never) => {
      const name = String(id);
      return {
        tryBeginCommit: vi.fn(async () => {
          if (committing.has(name)) {
            return false;
          }
          committing.add(name);
          return true;
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
    getTeacherById: vi.fn(),
    getAllTeachers: vi.fn(),
    updateTeacher: vi.fn(),
    deleteTeacher: vi.fn(),
    validateTeacherImport: vi.fn(),
    commitTeacherImport: vi.fn(),
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
        buildTeacherService()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        'students.csv'
      );

      const session = await service.createImport({
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
      expect(kv.put).toHaveBeenCalledTimes(1);
    });

    it('必須項目が欠けている行はエラーを投げ、KVには保存しない', async () => {
      const kv = createFakeKv();
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        buildTeacherService()
      );

      const file = csvFile('class_code,class_name\n,3年Cクラス\n', 'x.csv');

      await expect(
        service.createImport({ type: 'classrooms', file, fileName: 'x.csv' })
      ).rejects.toThrow();
      expect(kv.put).not.toHaveBeenCalled();
    });
  });

  describe('getImport', () => {
    it('存在しないimportIdはnullを返す', async () => {
      const kv = createFakeKv();
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        buildTeacherService()
      );

      await expect(
        service.getImport('nope', { offset: 0, limit: 10 })
      ).resolves.toBeNull();
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
        buildTeacherService()
      );

      const file = csvFile(
        'class_code,class_name\n13A,A\n13B,B\n13C,C\n',
        'c.csv'
      );
      const created = await service.createImport({
        type: 'classrooms',
        file,
        fileName: 'c.csv',
      });

      const page = await service.getImport(created.import_id, {
        offset: 1,
        limit: 1,
      });

      expect(page?.rows).toEqual([{ class_code: '13B', class_name: 'B' }]);
      expect(page?.rows_total).toBe(3);
    });
  });

  describe('commitImport', () => {
    it('存在しないimportIdはnot_foundを返す', async () => {
      const kv = createFakeKv();
      const service = createMasterImportService(
        kv,
        createFakeCommitLock(),
        buildStudentService(),
        buildClassRoomService(),
        buildTeacherService()
      );

      await expect(service.commitImport('nope')).resolves.toEqual({
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
        teacherService
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
        type: 'teachers',
        file,
        fileName: 't.csv',
      });

      const outcome = await service.commitImport(created.import_id);

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
        buildTeacherService()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        's.csv'
      );
      const created = await service.createImport({
        type: 'students',
        file,
        fileName: 's.csv',
      });

      const outcome = await service.commitImport(created.import_id);

      expect(outcome.status).toBe('committed');
      expect(outcome.status === 'committed' && outcome.alreadyCommitted).toBe(
        false
      );
      expect(commitStudentImport).toHaveBeenCalledTimes(1);

      const second = await service.commitImport(created.import_id);
      expect(second.status).toBe('committed');
      expect(second.status === 'committed' && second.alreadyCommitted).toBe(
        true
      );
      // 二度目はDBへの書き込みを再実行しない
      expect(commitStudentImport).toHaveBeenCalledTimes(1);
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
        buildTeacherService()
      );

      const file = csvFile(
        'class_code,attendance_number,student_id_number,last_name,first_name\n11A,1,10001,山田,太郎\n',
        's.csv'
      );
      const created = await service.createImport({
        type: 'students',
        file,
        fileName: 's.csv',
      });

      const [first, second] = await Promise.all([
        service.commitImport(created.import_id),
        service.commitImport(created.import_id),
      ]);

      expect(commitStudentImport).toHaveBeenCalledTimes(1);
      const alreadyCommittedFlags = [first, second].map(
        outcome => outcome.status === 'committed' && outcome.alreadyCommitted
      );
      expect(alreadyCommittedFlags.sort()).toEqual([false, true]);
    });
  });
});
