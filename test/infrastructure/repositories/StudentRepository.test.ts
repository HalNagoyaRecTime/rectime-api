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
    it('students に登録されている学生を全件返す', async () => {
      const students = await repo.findAll();

      expect(students).toHaveLength(seeded.students.length);
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
        user_name: target.userName,
        attendance_number: target.attendanceNumber,
        student_id_number: target.studentIdNumber,
        class_room_id: target.classRoomId,
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

      expect(student?.user_name).toBe(target.userName);
      expect(student?.user_id).toBe(target.userId);
      expect(student?.student_id_number).toBe(target.studentIdNumber);
    });

    it('存在しない学籍番号の場合は null を返す', async () => {
      expect(await repo.findByStudentNum('00000')).toBeNull();
    });
  });

  describe('create', () => {
    it('users と students を作成し、結合したエンティティを返す', async () => {
      const created = await repo.create({
        classRoomId: seeded.classRoomId,
        userName: '伊藤三郎',
        attendanceNumber: 99,
        studentIdNumber: '19999',
      });

      expect(created).toMatchObject({
        class_room_id: seeded.classRoomId,
        user_name: '伊藤三郎',
        attendance_number: 99,
        student_id_number: '19999',
      });

      const found = await repo.findById(created.student_id);
      expect(found).toMatchObject(created);
    });

    it('存在しない class_room_id の場合はエラーを投げる', async () => {
      await expect(
        repo.create({
          classRoomId: 999999,
          userName: '存在しないクラス',
          attendanceNumber: 98,
          studentIdNumber: '19998',
        })
      ).rejects.toThrow();
    });

    it('重複する student_id_number の場合はエラーを投げる', async () => {
      const target = seeded.students[0];
      await expect(
        repo.create({
          classRoomId: seeded.classRoomId,
          userName: '重複太郎',
          attendanceNumber: 97,
          studentIdNumber: target.studentIdNumber,
        })
      ).rejects.toThrow();
    });
  });
});
