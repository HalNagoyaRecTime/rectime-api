import { describe, expect, it, vi } from 'vitest';
import { createStudentMasterService } from '../../../src/application/services/StudentMasterService';
import type { IStudentMasterRepository } from '../../../src/domain/interfaces/repositories/IStudentMasterRepository';
import type { StudentMasterEntity } from '../../../src/domain/entities/StudentMaster';
import { StudentMasterDuplicateError } from '../../../src/domain/errors/StudentMasterDuplicateError';

function buildExisting(
  overrides: Partial<StudentMasterEntity> = {}
): StudentMasterEntity {
  return {
    student_master: 1,
    class_code: 11,
    attendance_number: 1,
    student_id_number: 90000,
    user_name: '既存太郎',
    created_at: '2026-01-01 00:00:00',
    ...overrides,
  };
}

function buildRepository(
  overrides: Partial<IStudentMasterRepository> = {}
): IStudentMasterRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    bulkCreate: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe('StudentMasterService', () => {
  describe('importStudentMaster', () => {
    it('重複がなければ全行を作成し、件数を返す', async () => {
      const rows = [
        {
          class_code: 11,
          attendance_number: 1,
          student_id_number: 90000,
          user_name: '田中太郎',
        },
        {
          class_code: 11,
          attendance_number: 2,
          student_id_number: 90001,
          user_name: '佐藤花子',
        },
      ];
      const bulkCreate = vi.fn().mockResolvedValue([
        buildExisting({ student_master: 1, ...rowToEntityOverrides(rows[0]) }),
        buildExisting({ student_master: 2, ...rowToEntityOverrides(rows[1]) }),
      ]);
      const repository = buildRepository({ bulkCreate });
      const service = createStudentMasterService(repository);

      const result = await service.importStudentMaster({ rows });

      expect(result).toEqual({ imported: 2 });
      expect(bulkCreate).toHaveBeenCalledWith([
        {
          classCode: 11,
          attendanceNumber: 1,
          studentIdNumber: 90000,
          userName: '田中太郎',
        },
        {
          classCode: 11,
          attendanceNumber: 2,
          studentIdNumber: 90001,
          userName: '佐藤花子',
        },
      ]);
    });

    it('ファイル内で学籍番号が重複している行を検出し、作成しない', async () => {
      const bulkCreate = vi.fn();
      const repository = buildRepository({ bulkCreate });
      const service = createStudentMasterService(repository);

      const rows = [
        {
          class_code: 11,
          attendance_number: 1,
          student_id_number: 90000,
          user_name: '田中太郎',
        },
        {
          class_code: 12,
          attendance_number: 1,
          student_id_number: 90000,
          user_name: '別クラスだが学籍番号が同じ',
        },
      ];

      const error = await service
        .importStudentMaster({ rows })
        .catch(e => e);

      expect(error).toBeInstanceOf(StudentMasterDuplicateError);
      expect((error as StudentMasterDuplicateError).duplicates).toEqual([
        expect.objectContaining({
          rowIndex: 0,
          reasons: ['student_id_number_duplicate_in_file'],
        }),
        expect.objectContaining({
          rowIndex: 1,
          reasons: ['student_id_number_duplicate_in_file'],
        }),
      ]);
      expect(bulkCreate).not.toHaveBeenCalled();
    });

    it('ファイル内で class_code + attendance_number が重複している行を検出する', async () => {
      const repository = buildRepository();
      const service = createStudentMasterService(repository);

      const rows = [
        {
          class_code: 11,
          attendance_number: 1,
          student_id_number: 90000,
          user_name: '田中太郎',
        },
        {
          class_code: 11,
          attendance_number: 1,
          student_id_number: 90001,
          user_name: '同じ座席に見える別人',
        },
      ];

      const error = await service
        .importStudentMaster({ rows })
        .catch(e => e);

      expect(error).toBeInstanceOf(StudentMasterDuplicateError);
      expect((error as StudentMasterDuplicateError).duplicates).toEqual([
        expect.objectContaining({
          rowIndex: 0,
          reasons: ['class_attendance_duplicate_in_file'],
        }),
        expect.objectContaining({
          rowIndex: 1,
          reasons: ['class_attendance_duplicate_in_file'],
        }),
      ]);
    });

    it('既存データと重複する行を検出する(学籍番号・class+出席番号それぞれ)', async () => {
      const existing = [
        buildExisting({
          student_master: 1,
          class_code: 11,
          attendance_number: 1,
          student_id_number: 90000,
        }),
      ];
      const repository = buildRepository({
        findAll: vi.fn().mockResolvedValue(existing),
      });
      const service = createStudentMasterService(repository);

      const rows = [
        {
          class_code: 99,
          attendance_number: 99,
          student_id_number: 90000, // 既存と学籍番号が重複
          user_name: '学籍番号重複太郎',
        },
        {
          class_code: 11,
          attendance_number: 1, // 既存と class+出席番号が重複
          student_id_number: 90099,
          user_name: 'クラス出席番号重複花子',
        },
      ];

      const error = await service
        .importStudentMaster({ rows })
        .catch(e => e);

      expect(error).toBeInstanceOf(StudentMasterDuplicateError);
      expect((error as StudentMasterDuplicateError).duplicates).toEqual([
        expect.objectContaining({
          rowIndex: 0,
          reasons: ['student_id_number_duplicate_in_db'],
        }),
        expect.objectContaining({
          rowIndex: 1,
          reasons: ['class_attendance_duplicate_in_db'],
        }),
      ]);
    });
  });
});

function rowToEntityOverrides(row: {
  class_code: number;
  attendance_number: number;
  student_id_number: number;
  user_name: string;
}) {
  return {
    class_code: row.class_code,
    attendance_number: row.attendance_number,
    student_id_number: row.student_id_number,
    user_name: row.user_name,
  };
}
