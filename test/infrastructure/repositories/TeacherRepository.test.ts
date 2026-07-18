import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTeacherRepository } from '../../../src/infrastructure/repositories/TeacherRepository';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';
import { seedStaffsTeachers, type SeededData } from '../../fixtures/staffsTeachers';

describe('TeacherRepository', () => {
  let repo: ITeacherRepository;
  let seeded: SeededData;

  beforeAll(async () => {
    seeded = await seedStaffsTeachers(env.DB);
    repo = createTeacherRepository(env.DB);
  });

  describe('findAll', () => {
    it('teachers に登録されている教員を全件返す', async () => {
      const teachers = await repo.findAll();

      expect(teachers).toHaveLength(seeded.teachers.length);
      const names = teachers.map(t => t.user_name).sort();
      const expected = seeded.teachers.map(t => t.displayName).sort();
      expect(names).toEqual(expected);
    });
  });

  describe('findById', () => {
    it('teachers の id で教員を取得し、users を join して返す', async () => {
      const target = seeded.teachers[0];
      const teacher = await repo.findById(target.teacherId);

      expect(teacher).toMatchObject({
        teacher_id: target.teacherId,
        user_id: target.userId,
        user_name: target.displayName,
      });
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });
});
