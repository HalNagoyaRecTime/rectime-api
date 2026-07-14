import { describe, expect, it, vi } from 'vitest';
import { createStudentService } from '../../../src/application/services/StudentService';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import type { IClassRepository } from '../../../src/domain/interfaces/repositories/IClassRepository';
import type { StudentEntity } from '../../../src/domain/entities/Student';

function buildStudent(overrides: Partial<StudentEntity> = {}): StudentEntity {
  return {
    f_student_id: 1,
    f_users_id: 10,
    f_user_name: '田中太郎',
    f_class_room_id: 100,
    f_uid: '0000-0000',
    f_attendance_number: 5,
    f_student_id_number: '10000',
    ...overrides,
  };
}

function buildClassRepository(
  overrides: Partial<IClassRepository> = {}
): IClassRepository {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
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
        student_id: student.f_student_id,
        user_name: student.f_user_name,
        class_room_id: student.f_class_room_id,
        uid: student.f_uid,
        attendance_number: student.f_attendance_number,
        student_id_number: student.f_student_id_number,
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
        buildStudent({ f_student_id: 1, f_student_id_number: '10000' }),
        buildStudent({ f_student_id: 2, f_student_id_number: '10001' }),
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
});
