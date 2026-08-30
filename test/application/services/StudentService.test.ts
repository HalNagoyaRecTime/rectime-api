import { describe, expect, it, vi } from 'vitest';
import { createStudentService } from '../../../src/application/services/StudentService';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';
import type { StudentEntity } from '../../../src/domain/entities/Student';

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

function createRepository(
  overrides: Partial<IStudentRepository> = {}
): IStudentRepository {
  return {
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findAll: vi.fn(),
    findByStudentNum: vi.fn(),
    findExistingStudentNumbers: vi.fn().mockResolvedValue(new Set()),
    classRoomExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createMany: vi.fn(),
    ...overrides,
  };
}

function createClassRoomRepository(
  overrides: Partial<IClassRoomRepository> = {}
): IClassRoomRepository {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn().mockResolvedValue(null),
    findExistingClassCodes: vi.fn().mockResolvedValue(new Set()),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateAndCleanupTeam: vi.fn(),
    delete: vi.fn(),
    deleteAndCleanupTeam: vi.fn(),
    teacherExists: vi.fn(),
    existsWithTeamId: vi.fn(),
    hasStudents: vi.fn(),
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
        user_id: student.user_id,
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

  describe('getByUserId', () => {
    it('指定した userId に紐づく学生が見つかる場合は StudentDTO に変換して返す', async () => {
      const student = buildStudent();
      const repository = createRepository({
        findByUserId: vi.fn().mockResolvedValue(student),
      });
      const classRoomRepository = createClassRoomRepository();
      const service = createStudentService(repository, classRoomRepository);

      const dto = await service.getByUserId(10);

      expect(dto).toEqual({
        student_id: student.student_id,
        user_id: student.user_id,
        display_name: student.user_name,
        class_room_id: student.class_room_id,
        class_room_name: student.class_room_name,
        attendance_number: student.attendance_number,
        student_id_number: student.student_id_number,
        is_live_active: true,
      });
      expect(repository.findByUserId).toHaveBeenCalledWith(10);
    });

    it('指定した userId に紐づく学生が見つからない場合はエラーを投げる', async () => {
      const repository = createRepository({
        findByUserId: vi.fn().mockResolvedValue(null),
      });
      const classRoomRepository = createClassRoomRepository();
      const service = createStudentService(repository, classRoomRepository);

      await expect(service.getByUserId(999)).rejects.toThrow(
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
      const createMany = vi.fn();
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        createMany,
      });
      const classRoomRepository = createClassRoomRepository();
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
      expect(createMany).not.toHaveBeenCalled();
    });

    it('ファイル内で学籍番号が重複する行はエラーとして報告する', async () => {
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

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
      expect(result.errors).toEqual([
        expect.objectContaining({
          row_index: 2,
          reason: 'student_id_number_duplicate_in_file',
        }),
      ]);
    });

    it('既存DBと学籍番号が重複する行はエラーとして報告する', async () => {
      const repository = createRepository({
        findExistingStudentNumbers: vi
          .fn()
          .mockResolvedValue(new Set(['24030'])),
      });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

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
            row_index: 1,
            reason: 'student_id_number_duplicate_in_db',
          }),
        ],
      });
    });

    it('2,000件の検査でも、既存学籍番号の問い合わせは1回にまとめる(D1のクエリ数上限対策)', async () => {
      const findExistingStudentNumbers = vi.fn().mockResolvedValue(new Set());
      const repository = createRepository({ findExistingStudentNumbers });
      const service = createStudentService(
        repository,
        createClassRoomRepository()
      );

      const rows = Array.from({ length: 2000 }, (_, i) => ({
        class_code: '11A',
        attendance_number: i + 1,
        student_id_number: `${30000 + i}`,
        last_name: '検証',
        first_name: `${i}`,
      }));

      const result = await service.validateStudentImport({ rows });

      expect(result).toEqual({
        total: 2000,
        success_count: 2000,
        error_count: 0,
        errors: [],
      });
      expect(findExistingStudentNumbers).toHaveBeenCalledTimes(1);
      expect(findExistingStudentNumbers.mock.calls[0][0]).toHaveLength(2000);
    });
  });

  describe('commitStudentImport', () => {
    it('全行が有効な場合は全件分をまとめてcreateManyに渡す', async () => {
      const createMany = vi.fn();
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        createMany,
      });
      const classRoomRepository = createClassRoomRepository({
        findExistingClassCodes: vi.fn().mockResolvedValue(new Set(['11A'])),
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
      expect(createMany).toHaveBeenCalledTimes(1);
      expect(createMany).toHaveBeenCalledWith({
        newClassRooms: [],
        students: [
          {
            displayName: '田中太郎',
            classCode: '11A',
            attendanceNumber: 1,
            studentIdNumber: '24001',
          },
          {
            displayName: '佐藤花子',
            classCode: '11A',
            attendanceNumber: 2,
            studentIdNumber: '24002',
          },
        ],
      });
    });

    it('クラス記号が見つからない場合はクラスコードを仮の名前として新規クラス作成をcreateManyに含める', async () => {
      const createMany = vi.fn();
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        createMany,
      });
      const classRoomRepository = createClassRoomRepository();
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
      expect(createMany).toHaveBeenCalledWith({
        newClassRooms: [{ classCode: '99Z', className: '99Z' }],
        students: [
          {
            displayName: '新規クラス',
            classCode: '99Z',
            attendanceNumber: 1,
            studentIdNumber: '24010',
          },
        ],
      });
    });

    it('同じ未登録クラス記号の行が複数あっても、newClassRoomsには1件だけ含める', async () => {
      const createMany = vi.fn();
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        createMany,
      });
      const classRoomRepository = createClassRoomRepository();
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
      const call = createMany.mock.calls[0][0];
      expect(call.newClassRooms).toEqual([
        { classCode: '99Z', className: '99Z' },
      ]);
      expect(call.students).toHaveLength(2);
      expect(classRoomRepository.findExistingClassCodes).toHaveBeenCalledWith([
        '99Z',
      ]);
      expect(classRoomRepository.findExistingClassCodes).toHaveBeenCalledTimes(
        1
      );
    });

    it('ファイル内で学籍番号が重複する行がある場合は1件も登録しない', async () => {
      const createMany = vi.fn();
      const repository = createRepository({
        findByStudentNum: vi.fn().mockResolvedValue(null),
        createMany,
      });
      const classRoomRepository = createClassRoomRepository();
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
            row_index: 2,
            reason: 'student_id_number_duplicate_in_file',
          }),
        ],
      });
      expect(createMany).not.toHaveBeenCalled();
    });

    it('既存DBと学籍番号が重複する行がある場合は1件も登録しない', async () => {
      const createMany = vi.fn();
      const repository = createRepository({
        findExistingStudentNumbers: vi
          .fn()
          .mockResolvedValue(new Set(['24030'])),
        createMany,
      });
      const classRoomRepository = createClassRoomRepository();
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
            row_index: 1,
            reason: 'student_id_number_duplicate_in_db',
          }),
        ],
      });
      expect(createMany).not.toHaveBeenCalled();
    });
  });
});
