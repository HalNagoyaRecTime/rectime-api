import { describe, expect, it, vi } from 'vitest';
import { createStudentService } from '../../../src/application/services/StudentService';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';
import type { StudentEntity } from '../../../src/domain/entities/Student';
import type { ClassRoomEntity } from '../../../src/domain/entities/ClassRoom';

function buildStudent(overrides: Partial<StudentEntity> = {}): StudentEntity {
  return {
    student_id: 1,
    user_id: 10,
    user_name: '田中太郎',
    class_room_id: 100,
    class_room_name: '1年A組',
    attendance_number: 5,
    student_id_number: '10000',
    is_live_active: true,
    ...overrides,
  };
}

function buildClassRoom(
  overrides: Partial<ClassRoomEntity> = {}
): ClassRoomEntity {
  return {
    class_room_id: 1,
    class_code: '11A',
    class_name: '1年Aクラス',
    ...overrides,
  };
}

function createRepository(
  overrides: Partial<IStudentRepository> = {}
): IStudentRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    findByStudentNum: vi.fn(),
    classRoomExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    ...overrides,
  };
}

function createClassRoomRepository(
  overrides: Partial<IClassRoomRepository> = {}
): IClassRoomRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    ...overrides,
  };
}

describe('StudentService', () => {
  describe('getStudentById', () => {
    it('存在する場合は StudentEntity を StudentDTO にマッピングして返す', async () => {
      const student = buildStudent();
      const repository = createRepository({
        findById: vi.fn().mockResolvedValue(student),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

      const dto = await service.getStudentById(1);

      expect(dto).toEqual({
        student_id: student.student_id,
        display_name: student.user_name,
        class_room_id: student.class_room_id,
        class_room_name: student.class_room_name,
        attendance_number: student.attendance_number,
        student_id_number: student.student_id_number,
        is_live_active: true,
      });
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository = createRepository({
        findById: vi.fn().mockResolvedValue(null),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

      await expect(service.getStudentById(999)).rejects.toThrow(
        'Student not found'
      );
    });
  });

  describe('getAllStudents', () => {
    it('全件を StudentDTO の配列にマッピングして返す', async () => {
      const students = [
        buildStudent({ student_id: 1, student_id_number: '10000' }),
        buildStudent({ student_id: 2, student_id_number: '10001' }),
      ];
      const repository = createRepository({
        findAll: vi.fn().mockResolvedValue({ students, total: 2 }),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

      const result = await service.getAllStudents({ limit: 50, offset: 0 });

      expect(result.students).toHaveLength(2);
      expect(result.students.map(d => d.student_id_number)).toEqual([
        '10000',
        '10001',
      ]);
      expect(result).toMatchObject({ total: 2, limit: 50, offset: 0 });
    });

    it('リポジトリが空配列を返す場合は空配列を返す（null 扱いにしない）', async () => {
      const repository = createRepository({
        findAll: vi.fn().mockResolvedValue({ students: [], total: 0 }),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

      await expect(
        service.getAllStudents({ limit: 50, offset: 0 })
      ).resolves.toMatchObject({ students: [], total: 0 });
    });
  });

  describe('createStudent', () => {
    it('クラスと学籍番号を検証して学生を作成する', async () => {
      const student = buildStudent();
      const repository = createRepository({
        classRoomExists: vi.fn().mockResolvedValue(true),
        findByStudentNum: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(student),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );
      const input = {
        display_name: student.user_name,
        class_room_id: student.class_room_id,
        attendance_number: student.attendance_number,
        student_id_number: student.student_id_number,
      };

      await expect(service.createStudent(input)).resolves.toMatchObject({
        student_id: student.student_id,
        class_room_name: student.class_room_name,
      });
      expect(repository.create).toHaveBeenCalledWith(input);
    });

    it('重複した学籍番号は拒否する', async () => {
      const repository = createRepository({
        classRoomExists: vi.fn().mockResolvedValue(true),
        findByStudentNum: vi.fn().mockResolvedValue(buildStudent()),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

      await expect(
        service.createStudent({
          display_name: '新規学生',
          class_room_id: 1,
          attendance_number: 1,
          student_id_number: '10000',
        })
      ).rejects.toThrow('Student number already exists');
    });
  });

  describe('updateStudent', () => {
    it('学生を更新する', async () => {
      const existing = buildStudent();
      const updated = buildStudent({ user_name: '更新後学生' });
      const repository = createRepository({
        findById: vi.fn().mockResolvedValue(existing),
        classRoomExists: vi.fn().mockResolvedValue(true),
        findByStudentNum: vi.fn().mockResolvedValue(null),
        update: vi.fn().mockResolvedValue(updated),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

      await expect(
        service.updateStudent(1, {
          display_name: '更新後学生',
          class_room_id: 100,
          attendance_number: 5,
          student_id_number: '10000',
        })
      ).resolves.toMatchObject({ display_name: '更新後学生' });
    });
  });

  describe('validateStudentImport', () => {
    it('全行が有効な場合はerrorsが空になり、DBへの書き込みは行わない', async () => {
      const createClassRoom = vi.fn();
      const classRoomRepository = createClassRoomRepository({
        create: createClassRoom,
      });
      const create = vi.fn();
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        create,
      });
      const service = createStudentService(repository, classRoomRepository);

      const result = await service.validateStudentImport({
        rows: [
          {
            class_code: '11A',
            attendance_number: 1,
            student_id_number: '24001',
            last_name: '田中',
            first_name: '太郎',
          },
          {
            class_code: '11A',
            attendance_number: 2,
            student_id_number: '24002',
            last_name: '佐藤',
            first_name: '花子',
          },
        ],
      });

      expect(result).toEqual({
        total: 2,
        success_count: 2,
        error_count: 0,
        errors: [],
      });
      expect(create).not.toHaveBeenCalled();
      expect(createClassRoom).not.toHaveBeenCalled();
    });

    it('ファイル内で学籍番号が重複する行はエラーとして報告する', async () => {
      const classRoomRepository = createClassRoomRepository();
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
      });
      const service = createStudentService(repository, classRoomRepository);

      const row = {
        class_code: '11A',
        attendance_number: 1,
        student_id_number: '24020',
        last_name: '重複',
        first_name: '太郎',
      };

      const result = await service.validateStudentImport({
        rows: [row, { ...row, attendance_number: 2, last_name: '重複2' }],
      });

      expect(result.success_count).toBe(1);
      expect(result.error_count).toBe(1);
      expect(result.errors).toEqual([
        expect.objectContaining({
          row_index: 1,
          reason: 'student_id_number_duplicate_in_file',
        }),
      ]);
    });

    it('既存DBと学籍番号が重複する行はエラーとして報告する', async () => {
      const classRoomRepository = createClassRoomRepository();
      const repository = createRepository({
        findByStudentNum: vi
          .fn()
          .mockResolvedValue(buildStudent({ student_id_number: '24030' })),
      });
      const service = createStudentService(repository, classRoomRepository);

      const result = await service.validateStudentImport({
        rows: [
          {
            class_code: '11A',
            attendance_number: 1,
            student_id_number: '24030',
            last_name: '既存',
            first_name: '太郎',
          },
        ],
      });

      expect(result).toEqual({
        total: 1,
        success_count: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 0,
            reason: 'student_id_number_duplicate_in_db',
          }),
        ],
      });
    });
  });

  describe('commitStudentImport', () => {
    it('全行が有効な場合は全件作成する', async () => {
      const classRoomRepository = createClassRoomRepository({
        findAll: vi.fn().mockResolvedValue([buildClassRoom()]),
      });
      const create = vi.fn().mockResolvedValue(buildStudent());
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        create,
      });
      const service = createStudentService(repository, classRoomRepository);

      const result = await service.commitStudentImport({
        rows: [
          {
            class_code: '11A',
            attendance_number: 1,
            student_id_number: '24001',
            last_name: '田中',
            first_name: '太郎',
          },
          {
            class_code: '11A',
            attendance_number: 2,
            student_id_number: '24002',
            last_name: '佐藤',
            first_name: '花子',
          },
        ],
      });

      expect(result).toEqual({
        total: 2,
        imported: 2,
        error_count: 0,
        errors: [],
      });
      expect(create).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenNthCalledWith(1, {
        class_room_id: 1,
        display_name: '田中太郎',
        attendance_number: 1,
        student_id_number: '24001',
      });
    });

    it('クラス記号が見つからない場合はクラスコードを仮の名前として自動作成し、生徒も作成する', async () => {
      const createClassRoom = vi.fn().mockResolvedValue(
        buildClassRoom({
          class_room_id: 99,
          class_code: '99Z',
          class_name: '99Z',
        })
      );
      const classRoomRepository = createClassRoomRepository({
        findAll: vi.fn().mockResolvedValue([]),
        create: createClassRoom,
      });
      const createStudent = vi.fn().mockResolvedValue(buildStudent());
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        create: createStudent,
      });
      const service = createStudentService(repository, classRoomRepository);

      const result = await service.commitStudentImport({
        rows: [
          {
            class_code: '99Z',
            attendance_number: 1,
            student_id_number: '24010',
            last_name: '新規',
            first_name: 'クラス',
          },
        ],
      });

      expect(result).toEqual({
        total: 1,
        imported: 1,
        error_count: 0,
        errors: [],
      });
      expect(createClassRoom).toHaveBeenCalledWith({
        classCode: '99Z',
        name: '99Z',
      });
      expect(createStudent).toHaveBeenCalledWith({
        class_room_id: 99,
        display_name: '新規クラス',
        attendance_number: 1,
        student_id_number: '24010',
      });
    });

    it('同じ未登録クラス記号の行が複数あっても、クラスの自動作成は1回だけ行う', async () => {
      const createClassRoom = vi.fn().mockResolvedValue(
        buildClassRoom({
          class_room_id: 99,
          class_code: '99Z',
          class_name: '99Z',
        })
      );
      const classRoomRepository = createClassRoomRepository({
        findAll: vi.fn().mockResolvedValue([]),
        create: createClassRoom,
      });
      const createStudent = vi.fn().mockResolvedValue(buildStudent());
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        create: createStudent,
      });
      const service = createStudentService(repository, classRoomRepository);

      const result = await service.commitStudentImport({
        rows: [
          {
            class_code: '99Z',
            attendance_number: 1,
            student_id_number: '24010',
            last_name: '新規',
            first_name: 'A',
          },
          {
            class_code: '99Z',
            attendance_number: 2,
            student_id_number: '24011',
            last_name: '新規',
            first_name: 'B',
          },
        ],
      });

      expect(result.imported).toBe(2);
      expect(createClassRoom).toHaveBeenCalledTimes(1);
      expect(createStudent).toHaveBeenCalledTimes(2);
    });

    it('ファイル内で学籍番号が重複する行がある場合は1件も登録しない', async () => {
      const createClassRoom = vi.fn();
      const classRoomRepository = createClassRoomRepository({
        findAll: vi.fn().mockResolvedValue([buildClassRoom()]),
        create: createClassRoom,
      });
      const create = vi.fn();
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        create,
      });
      const service = createStudentService(repository, classRoomRepository);

      const row = {
        class_code: '11A',
        attendance_number: 1,
        student_id_number: '24020',
        last_name: '重複',
        first_name: '太郎',
      };

      const result = await service.commitStudentImport({
        rows: [row, { ...row, attendance_number: 2, last_name: '重複2' }],
      });

      expect(result).toEqual({
        total: 2,
        imported: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 1,
            reason: 'student_id_number_duplicate_in_file',
          }),
        ],
      });
      expect(create).not.toHaveBeenCalled();
      expect(createClassRoom).not.toHaveBeenCalled();
    });

    it('既存DBと学籍番号が重複する行がある場合は1件も登録しない', async () => {
      const createClassRoom = vi.fn();
      const classRoomRepository = createClassRoomRepository({
        findAll: vi.fn().mockResolvedValue([buildClassRoom()]),
        create: createClassRoom,
      });
      const create = vi.fn();
      const repository = createRepository({
        findByStudentNum: vi
          .fn()
          .mockResolvedValue(buildStudent({ student_id_number: '24030' })),
        create,
      });
      const service = createStudentService(repository, classRoomRepository);

      const result = await service.commitStudentImport({
        rows: [
          {
            class_code: '11A',
            attendance_number: 1,
            student_id_number: '24030',
            last_name: '既存',
            first_name: '太郎',
          },
        ],
      });

      expect(result).toEqual({
        total: 1,
        imported: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 0,
            reason: 'student_id_number_duplicate_in_db',
          }),
        ],
      });
      expect(create).not.toHaveBeenCalled();
      expect(createClassRoom).not.toHaveBeenCalled();
    });
  });
});
