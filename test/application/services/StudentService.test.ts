import { describe, expect, it, vi } from 'vitest';
import { createStudentService } from '../../../src/application/services/StudentService';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
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
    findAll: vi.fn(),
    findByStudentNum: vi.fn(),
    classRoomExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
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
      const service = createStudentService(repository);

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
      const service = createStudentService(repository);

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
      const service = createStudentService(repository);

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
      const service = createStudentService(repository);

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
      const service = createStudentService(repository);
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
      const service = createStudentService(repository);

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
      const service = createStudentService(repository);

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
});
