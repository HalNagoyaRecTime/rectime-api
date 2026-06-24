import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createStudentRepository } from './StudentRepository';
import type { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';

// NOTE: テストは migrations/0004_update_student_schema.sql のシードデータに依存する。
//   m_users / m_student_description に学生4件（先生1名は description 無しで除外）。
describe('StudentRepository', () => {
  let repo: IStudentRepository;

  beforeAll(() => {
    repo = createStudentRepository(env.DB);
  });

  describe('findAll', () => {
    it('description を持つ学生を全件返す（先生は除外される）', async () => {
      const students = await repo.findAll();

      expect(students).toHaveLength(4);
      const numbers = students.map(s => s.f_student_id_number).sort();
      expect(numbers).toEqual(['10000', '10001', '10002', '10003']);
    });
  });

  describe('findById', () => {
    it('student_description の id で学生を取得し、users を join して返す', async () => {
      const student = await repo.findById(1);

      expect(student).toMatchObject({
        f_student_id: 1,
        f_users_id: 1,
        f_display_name: '田中太郎',
        f_uid: '0000-0000',
        f_attendance_number: 1,
        f_student_id_number: '10000',
        f_class_room_id: 1,
      });
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(9999)).toBeNull();
    });
  });

  describe('findByStudentNum', () => {
    it('学籍番号で学生を取得できる', async () => {
      const student = await repo.findByStudentNum('10002');

      expect(student?.f_display_name).toBe('鈴木一郎');
      expect(student?.f_users_id).toBe(3);
      expect(student?.f_student_id_number).toBe('10002');
    });

    it('存在しない学籍番号の場合は null を返す', async () => {
      expect(await repo.findByStudentNum('00000')).toBeNull();
    });
  });
});
