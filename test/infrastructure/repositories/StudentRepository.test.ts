import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it, vi } from 'vitest';
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
    it('students に登録されている学生を全件返す', async () => {
      const result = await repo.findAll({ limit: 50, offset: 0 });
      const students = result.students;

      expect(students).toHaveLength(seeded.students.length);
      expect(result.total).toBe(seeded.students.length);
      const numbers = students.map(s => s.student_id_number).sort();
      const expected = seeded.students.map(s => s.studentIdNumber).sort();
      expect(numbers).toEqual(expected);
    });
  });

  describe('findById', () => {
    it('students の id で学生を取得し、users を join して返す', async () => {
      const target = seeded.students[0];
      const student = await repo.findById(target.studentId);

      expect(student).toMatchObject({
        student_id: target.studentId,
        user_id: target.userId,
        user_name: target.displayName,
        attendance_number: target.attendanceNumber,
        student_id_number: target.studentIdNumber,
        class_room_id: target.classRoomId,
        class_room_name: 'テスト教室',
        is_live_active: true,
      });
    });

    it('存在しない id の場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });

    describe('findByUserId', () => {
    it('users の id で学生を取得し、users を join して返す', async () => {
      const target = seeded.students[0];
      const student = await repo.findByUserId(target.userId);
 
      expect(student).toMatchObject({
        student_id: target.studentId,
        user_id: target.userId,
        user_name: target.displayName,
        attendance_number: target.attendanceNumber,
        student_id_number: target.studentIdNumber,
        class_room_id: target.classRoomId,
        class_room_name: 'テスト教室',
        is_live_active: true,
      });
    });
 
    it('存在しない userId の場合は null を返す', async () => {
      expect(await repo.findByUserId(999999)).toBeNull();
    });
  });

  describe('findByStudentNum', () => {
    it('学籍番号で学生を取得できる', async () => {
      const target = seeded.students[2];
      const student = await repo.findByStudentNum(target.studentIdNumber);

      expect(student?.user_name).toBe(target.displayName);
      expect(student?.user_id).toBe(target.userId);
      expect(student?.student_id_number).toBe(target.studentIdNumber);
    });

    it('存在しない学籍番号の場合は null を返す', async () => {
      expect(await repo.findByStudentNum('00000')).toBeNull();
    });
  });

  describe('create / update', () => {
    it('学生を作成、更新できる', async () => {
      const input = {
        display_name: '新規学生',
        class_room_id: seeded.classRoomId,
        attendance_number: 10,
        student_id_number: '10010',
      };
      const findByStudentNumSpy = vi.spyOn(repo, 'findByStudentNum');
      const created = await repo.create(input);

      expect(created).toMatchObject({
        user_name: input.display_name,
        class_room_name: 'テスト教室',
        is_live_active: true,
      });
      expect(findByStudentNumSpy).not.toHaveBeenCalled();

      const findByIdSpy = vi.spyOn(repo, 'findById');
      const updated = await repo.update(created.student_id, {
        ...input,
        display_name: '更新学生',
        attendance_number: 11,
      });
      expect(updated).toMatchObject({
        user_name: '更新学生',
        attendance_number: 11,
      });
      expect(findByIdSpy).not.toHaveBeenCalled();
    });

    it('存在しない学生の更新は null を返す', async () => {
      await expect(
        repo.update(999999, {
          display_name: '存在しない学生',
          class_room_id: seeded.classRoomId,
          attendance_number: 99,
          student_id_number: '19999',
        })
      ).resolves.toBeNull();
    });
  });
});
