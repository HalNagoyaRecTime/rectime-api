import { describe, expect, it, vi } from 'vitest';
import { createClassRoomService } from '../../../src/application/services/ClassRoomService';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';

function repository(): IClassRoomRepository {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn().mockResolvedValue(null),
    findExistingClassCodes: vi.fn().mockResolvedValue(new Set()),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    teacherExists: vi.fn(),
    hasStudents: vi.fn(),
  };
}

describe('ClassRoomService', () => {
  it('一覧をlimitとoffset付きで返す', async () => {
    const repo = repository();
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      classrooms: [
        {
          class_room_id: 1,
          class_code: 'IA14A',
          class_name: '高度情報学科AI開発先行コース',
          student_count: 2,
          teacher: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    await expect(
      createClassRoomService(repo).getAllClassrooms(20, 0)
    ).resolves.toEqual({
      classrooms: [
        {
          class_room_id: 1,
          class_code: 'IA14A',
          class_name: '高度情報学科AI開発先行コース',
          student_count: 2,
          teacher: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  it('存在しない担任は登録前に404用エラーにする', async () => {
    const repo = repository();
    (repo.teacherExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      createClassRoomService(repo).createClassroom({
        class_code: 'IA14A',
        class_name: '高度情報学科AI開発先行コース',
        teacher_id: 1,
      })
    ).rejects.toThrow('Teacher not found');
  });

  it('存在する担任を指定してクラスを登録できる', async () => {
    const repo = repository();
    const input = {
      class_code: 'IA14A',
      class_name: '高度情報学科AI開発先行コース',
      teacher_id: 1,
    };
    const classroom = {
      class_room_id: 1,
      class_code: 'IA14A',
      class_name: '高度情報学科AI開発先行コース',
      student_count: 0,
      teacher: { teacher_id: 1, user_id: 10, display_name: '担任教員' },
    };
    (repo.teacherExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(classroom);

    await expect(
      createClassRoomService(repo).createClassroom(input)
    ).resolves.toEqual(classroom);
    expect(repo.create).toHaveBeenCalledWith(input);
  });

  it('クラスコード重複を409用エラーにする', async () => {
    const repo = repository();
    (repo.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('UNIQUE constraint failed: class_rooms.class_code')
    );

    await expect(
      createClassRoomService(repo).createClassroom({
        class_code: 'IA14A',
        class_name: '高度情報学科AI開発先行コース',
        teacher_id: null,
      })
    ).rejects.toThrow('Class code already exists');
  });

  it('存在しないクラスを更新すると404用エラーにする', async () => {
    const repo = repository();
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      createClassRoomService(repo).updateClassroom(999, {
        class_code: 'IA14A',
        class_name: '高度情報学科AI開発先行コース',
        teacher_id: null,
      })
    ).rejects.toThrow('Class not found');
  });

  it('学生が所属するクラスの削除を拒否する', async () => {
    const repo = repository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      createClassRoomService(repo).deleteClassroom(1)
    ).rejects.toThrow('Class is referenced by students');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('存在しないクラスの削除を404用エラーにする', async () => {
    const repo = repository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      createClassRoomService(repo).deleteClassroom(999)
    ).rejects.toThrow('Class not found');
  });

  describe('validateClassRoomImport', () => {
    it('全行が有効な場合はerrorsが空になり、DBへの書き込みは行わない', async () => {
      const repo = repository();
      const service = createClassRoomService(repo);

      const result = await service.validateClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13D', class_name: '3年Dクラス' },
        ],
      });

      expect(result).toEqual({
        total: 2,
        success_count: 2,
        error_count: 0,
        errors: [],
      });
      expect(repo.createMany).not.toHaveBeenCalled();
    });

    it('既存DBとクラス記号が重複する行はエラーとして報告する', async () => {
      const repo = repository();
      (
        repo.findExistingClassCodes as ReturnType<typeof vi.fn>
      ).mockResolvedValue(new Set(['13C']));
      const service = createClassRoomService(repo);

      const result = await service.validateClassRoomImport({
        rows: [{ class_code: '13C', class_name: '3年Cクラス(重複)' }],
      });

      expect(result).toEqual({
        total: 1,
        success_count: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 0,
            reason: 'class_code_duplicate_in_db',
          }),
        ],
      });
    });

    it('ファイル内でクラス記号が重複する行はエラーとして報告する', async () => {
      const repo = repository();
      const service = createClassRoomService(repo);

      const result = await service.validateClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13C', class_name: '3年Cクラス(重複)' },
        ],
      });

      expect(result.success_count).toBe(1);
      expect(result.errors).toEqual([
        expect.objectContaining({
          row_index: 1,
          reason: 'class_code_duplicate_in_file',
        }),
      ]);
    });

    it('2,000件の検査でも、既存クラスコードの問い合わせは1回にまとめる(D1のクエリ数上限対策)', async () => {
      const repo = repository();
      const service = createClassRoomService(repo);

      const rows = Array.from({ length: 2000 }, (_, i) => ({
        class_code: `C${i}`,
        class_name: `クラス${i}`,
      }));

      const result = await service.validateClassRoomImport({ rows });

      expect(result).toEqual({
        total: 2000,
        success_count: 2000,
        error_count: 0,
        errors: [],
      });
      const findExistingClassCodes = repo.findExistingClassCodes as ReturnType<
        typeof vi.fn
      >;
      expect(findExistingClassCodes).toHaveBeenCalledTimes(1);
      expect(findExistingClassCodes.mock.calls[0][0]).toHaveLength(2000);
    });
  });

  describe('commitClassRoomImport', () => {
    it('全行が有効な場合は全件分をまとめてcreateManyに渡す', async () => {
      const repo = repository();
      const service = createClassRoomService(repo);

      const result = await service.commitClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13D', class_name: '3年Dクラス' },
        ],
      });

      expect(result).toEqual({
        total: 2,
        imported: 2,
        error_count: 0,
        errors: [],
      });
      expect(repo.createMany).toHaveBeenCalledTimes(1);
      expect(repo.createMany).toHaveBeenCalledWith([
        { class_code: '13C', class_name: '3年Cクラス', teacher_id: null },
        { class_code: '13D', class_name: '3年Dクラス', teacher_id: null },
      ]);
    });

    it('クラス記号が重複する行がある場合は1件も登録しない', async () => {
      const repo = repository();
      (
        repo.findExistingClassCodes as ReturnType<typeof vi.fn>
      ).mockResolvedValue(new Set(['13C']));
      const service = createClassRoomService(repo);

      const result = await service.commitClassRoomImport({
        rows: [{ class_code: '13C', class_name: '3年Cクラス(重複)' }],
      });

      expect(result).toEqual({
        total: 1,
        imported: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 0,
            reason: 'class_code_duplicate_in_db',
          }),
        ],
      });
      expect(repo.createMany).not.toHaveBeenCalled();
    });
  });
});
