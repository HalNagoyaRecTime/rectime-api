import { describe, expect, it, vi } from 'vitest';
import { createTeacherService } from '../../../src/application/services/TeacherService';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';
import type { TeacherEntity } from '../../../src/domain/entities/Teacher';

function buildTeacher(overrides: Partial<TeacherEntity> = {}): TeacherEntity {
  return {
    teacher_id: 1,
    user_id: 10,
    user_name: '山田先生',
    ...overrides,
  };
}

describe('TeacherService', () => {
  describe('getTeacherById', () => {
    it('存在する場合は TeacherEntity を TeacherDTO にマッピングして返す', async () => {
      const teacher = buildTeacher();
      const repository: ITeacherRepository = {
        findById: vi.fn().mockResolvedValue(teacher),
        findAll: vi.fn(),
      };
      const service = createTeacherService(repository);

      const dto = await service.getTeacherById(1);

      expect(dto).toEqual({
        teacher_id: teacher.teacher_id,
        user_id: teacher.user_id,
      });
      expect(repository.findById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合はエラーを投げる', async () => {
      const repository: ITeacherRepository = {
        findById: vi.fn().mockResolvedValue(null),
        findAll: vi.fn(),
      };
      const service = createTeacherService(repository);

      await expect(service.getTeacherById(999)).rejects.toThrow(
        'Teacher not found'
      );
    });
  });

  describe('getAllTeachers', () => {
    it('全件を TeacherDTO の配列にマッピングして返す', async () => {
      const teachers = [
        buildTeacher({ teacher_id: 1 }),
        buildTeacher({ teacher_id: 2, user_name: '中村先生' }),
      ];
      const repository: ITeacherRepository = {
        findById: vi.fn(),
        findAll: vi.fn().mockResolvedValue(teachers),
      };
      const service = createTeacherService(repository);

      const dtos = await service.getAllTeachers();

      expect(dtos).toEqual([
        { teacher_id: 1, user_id: teachers[0].user_id },
        { teacher_id: 2, user_id: teachers[1].user_id },
      ]);
    });

    it('リポジトリが空配列を返す場合は空配列を返す', async () => {
      const repository: ITeacherRepository = {
        findById: vi.fn(),
        findAll: vi.fn().mockResolvedValue([]),
      };
      const service = createTeacherService(repository);

      await expect(service.getAllTeachers()).resolves.toEqual([]);
    });
  });
});
