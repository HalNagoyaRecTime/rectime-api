import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createStudentRepository } from '../../../src/infrastructure/repositories/StudentRepository';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import { seedStudents, type SeededData } from '../../fixtures/students';

describe('StudentRepository', () => {
  let repo: IStudentRepository;
  let seeded: SeededData;

  beforeAll(async () => {
    // テストデータはtest/fixtures/students.ts で作成、挿入される。
    seeded = await seedStudents(env.DB);
    repo = createStudentRepository(env.DB);
  });

  describe('findAll', () => {
    it('description を持つ学生を全件返す（先生は除外される）', async () => {
      const students = await repo.findAll();

      expect(students).toHaveLength(seeded.students.length);
      const numbers = students.map(s => s.f_student_id_number).sort();
      const expected = seeded.students.map(s => s.studentIdNumber).sort();
      expect(numbers).toEqual(expected);
    });
  });

  describe('findById', () => {
    it('student_description の id で学生を取得し、users を join して返す', async () => {
      const target = seeded.students[0];
      const student = await repo.findById(target.studentId);

      expect(student).toMatchObject({
        f_student_id: target.studentId,
        f_users_id: target.usersId,
        f_display_name: target.displayName,
        f_uid: target.uid,
        f_attendance_number: target.attendanceNumber,
        f_student_id_number: target.studentIdNumber,
        f_class_room_id: target.classRoomId,
      });
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });

  describe('findByStudentNum', () => {
    it('学籍番号で学生を取得できる', async () => {
      const target = seeded.students[2];
      const student = await repo.findByStudentNum(target.studentIdNumber);

      expect(student?.f_display_name).toBe(target.displayName);
      expect(student?.f_users_id).toBe(target.usersId);
      expect(student?.f_student_id_number).toBe(target.studentIdNumber);
    });

    it('存在しない学籍番号の場合は null を返す', async () => {
      expect(await repo.findByStudentNum('00000')).toBeNull();
    });
  });
});
