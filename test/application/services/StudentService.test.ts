import { describe, expect, it, vi } from 'vitest';
import { createStudentService } from '../../../src/application/services/StudentService';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import type { IClassRepository } from '../../../src/domain/interfaces/repositories/IClassRepository';
import type { StudentEntity } from '../../../src/domain/entities/Student';
import type { ClassEntity } from '../../../src/domain/entities/Class';

function buildStudent(overrides: Partial<StudentEntity> = {}): StudentEntity {
  return {
    student_id: 1,
    user_id: 10,
    user_name: '田中太郎',
    class_room_id: 100,
    attendance_number: 5,
    student_id_number: '10000',
    ...overrides,
  };
}

function buildClassRoom(overrides: Partial<ClassEntity> = {}): ClassEntity {
  return {
    f_class_room_id: 1,
    f_class_code: '11A',
    f_name: '1年Aクラス',
    ...overrides,
  };
}

function buildClassRepository(
  overrides: Partial<IClassRepository> = {}
): IClassRepository {
  return {
    findAll: vi.fn().mockResolvedValue([]),
    findById: vi.fn(),
    create: vi.fn(),
    ...overrides,
  };
}

function buildStudentRepository(
  overrides: Partial<IStudentRepository> = {}
): IStudentRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn().mockResolvedValue([]),
    findByStudentNum: vi.fn(),
    create: vi.fn().mockResolvedValue(buildStudent()),
    ...overrides,
  };
}

describe('StudentService', () => {
  describe('getStudentById', () => {
    it('存在する場合は StudentEntity を StudentDTO にマッピングして返す', async () => {
      const student = buildStudent();
      const repository: IStudentRepository = {
        findById: vi.fn().mockResolvedValue(student),
        findAll: vi.fn(),
        findByStudentNum: vi.fn(),
        create: vi.fn(),
      };
      const service = createStudentService(repository, buildClassRepository());

      const dto = await service.getStudentById(1);

      expect(dto).toEqual({
        student_id: student.student_id,
        user_name: student.user_name,
        class_room_id: student.class_room_id,
        attendance_number: student.attendance_number,
        student_id_number: student.student_id_number,
      });
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository: IStudentRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findAll: vi.fn(),
        findByStudentNum: vi.fn(),
        create: vi.fn(),
      };
      const service = createStudentService(repository, buildClassRepository());

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
      const repository: IStudentRepository = {
        findById: vi.fn(),
        findAll: vi.fn().mockResolvedValue(students),
        findByStudentNum: vi.fn(),
        create: vi.fn(),
      };
      const service = createStudentService(repository, buildClassRepository());

      const dtos = await service.getAllStudents();

      expect(dtos).toHaveLength(2);
      expect(dtos.map(d => d.student_id_number)).toEqual(['10000', '10001']);
    });

    it('リポジトリが空配列を返す場合は空配列を返す（null 扱いにしない）', async () => {
      const repository: IStudentRepository = {
        findById: vi.fn(),
        findAll: vi.fn().mockResolvedValue([]),
        findByStudentNum: vi.fn(),
        create: vi.fn(),
      };
      const service = createStudentService(repository, buildClassRepository());

      await expect(service.getAllStudents()).resolves.toEqual([]);
    });
  });

  describe('bulkImportStudents', () => {
    it('全行が有効な場合は全件作成し、skippedは空になる', async () => {
      const classRepository = buildClassRepository({
        findAll: vi.fn().mockResolvedValue([buildClassRoom()]),
      });
      const create = vi.fn().mockResolvedValue(buildStudent());
      const studentRepository = buildStudentRepository({ create });
      const service = createStudentService(studentRepository, classRepository);

      const result = await service.bulkImportStudents({
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

      expect(result).toEqual({ imported: 2, skipped: [] });
      expect(create).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenNthCalledWith(1, {
        classRoomId: 1,
        userName: '田中太郎',
        attendanceNumber: 1,
        studentIdNumber: '24001',
      });
    });

    it('クラス記号が見つからない場合はクラスコードを仮の名前として自動作成し、生徒も作成する', async () => {
      const createClass = vi
        .fn()
        .mockResolvedValue(
          buildClassRoom({ f_class_room_id: 99, f_class_code: '99Z', f_name: '99Z' })
        );
      const classRepository = buildClassRepository({
        findAll: vi.fn().mockResolvedValue([]),
        create: createClass,
      });
      const createStudent = vi.fn().mockResolvedValue(buildStudent());
      const studentRepository = buildStudentRepository({
        create: createStudent,
      });
      const service = createStudentService(studentRepository, classRepository);

      const result = await service.bulkImportStudents({
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

      expect(result).toEqual({ imported: 1, skipped: [] });
      expect(createClass).toHaveBeenCalledWith({
        classCode: '99Z',
        name: '99Z',
      });
      expect(createStudent).toHaveBeenCalledWith({
        classRoomId: 99,
        userName: '新規クラス',
        attendanceNumber: 1,
        studentIdNumber: '24010',
      });
    });

    it('同じ未登録クラス記号の行が複数あっても、クラスの自動作成は1回だけ行う', async () => {
      const createClass = vi
        .fn()
        .mockResolvedValue(
          buildClassRoom({ f_class_room_id: 99, f_class_code: '99Z', f_name: '99Z' })
        );
      const classRepository = buildClassRepository({
        findAll: vi.fn().mockResolvedValue([]),
        create: createClass,
      });
      const createStudent = vi.fn().mockResolvedValue(buildStudent());
      const studentRepository = buildStudentRepository({
        create: createStudent,
      });
      const service = createStudentService(studentRepository, classRepository);

      const result = await service.bulkImportStudents({
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
      expect(createClass).toHaveBeenCalledTimes(1);
      expect(createStudent).toHaveBeenCalledTimes(2);
    });

    it('ファイル内で学籍番号が重複する行は2件目以降をスキップする', async () => {
      const classRepository = buildClassRepository({
        findAll: vi.fn().mockResolvedValue([buildClassRoom()]),
      });
      const create = vi.fn().mockResolvedValue(buildStudent());
      const studentRepository = buildStudentRepository({ create });
      const service = createStudentService(studentRepository, classRepository);

      const row = {
        class_code: '11A',
        attendance_number: 1,
        student_id_number: '24020',
        last_name: '重複',
        first_name: '太郎',
      };

      const result = await service.bulkImportStudents({
        rows: [row, { ...row, attendance_number: 2, last_name: '重複2' }],
      });

      expect(result.imported).toBe(1);
      expect(result.skipped).toEqual([
        expect.objectContaining({
          row_index: 1,
          reason: 'student_id_number_duplicate_in_file',
        }),
      ]);
      expect(create).toHaveBeenCalledTimes(1);
    });

    it('既存DBと学籍番号が重複する行はスキップする', async () => {
      const classRepository = buildClassRepository({
        findAll: vi.fn().mockResolvedValue([buildClassRoom()]),
      });
      const create = vi.fn().mockResolvedValue(buildStudent());
      const studentRepository = buildStudentRepository({
        findAll: vi
          .fn()
          .mockResolvedValue([
            buildStudent({ student_id_number: '24030' }),
          ]),
        create,
      });
      const service = createStudentService(studentRepository, classRepository);

      const result = await service.bulkImportStudents({
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
        imported: 0,
        skipped: [
          expect.objectContaining({
            row_index: 0,
            reason: 'student_id_number_duplicate_in_db',
          }),
        ],
      });
      expect(create).not.toHaveBeenCalled();
    });
  });
});
