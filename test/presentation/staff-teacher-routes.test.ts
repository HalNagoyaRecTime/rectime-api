import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../src/index';
import {
  seedStaffsAndTeachers,
  type SeededStaffTeacherData,
} from '../fixtures/staffs-teachers';

describe('staff/teacher API routes', () => {
  let seeded: SeededStaffTeacherData;

  beforeAll(async () => {
    seeded = await seedStaffsAndTeachers(env.DB);
  });

  describe('GET /api/v1/staffs', () => {
    it('スタッフ一覧を返す', async () => {
      const res = await app.fetch(
        new Request('http://example.com/api/v1/staffs'),
        env
      );
      const body = await res.json<Array<{ display_name: string }>>();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(seeded.staffs.length);
      expect(body.map(s => s.display_name).sort()).toEqual(
        seeded.staffs.map(s => s.displayName).sort()
      );
    });
  });

  describe('GET /api/v1/staffs/:staffId', () => {
    it('有効なIDのスタッフを返す', async () => {
      const target = seeded.staffs[0];
      const res = await app.fetch(
        new Request(`http://example.com/api/v1/staffs/${target.staffId}`),
        env
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        staff_id: target.staffId,
        user_id: target.userId,
        display_name: target.displayName,
      });
    });

    it('不正なIDの場合は400を返す', async () => {
      const res = await app.fetch(
        new Request('http://example.com/api/v1/staffs/abc'),
        env
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid staff ID' });
    });

    it('存在しないIDの場合は404を返す', async () => {
      const res = await app.fetch(
        new Request('http://example.com/api/v1/staffs/999999'),
        env
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Staff not found' });
    });
  });

  describe('GET /api/v1/teachers', () => {
    it('教員一覧を返す', async () => {
      const res = await app.fetch(
        new Request('http://example.com/api/v1/teachers'),
        env
      );
      const body = await res.json<Array<{ display_name: string }>>();

      expect(res.status).toBe(200);
      expect(body).toHaveLength(seeded.teachers.length);
      expect(body.map(t => t.display_name).sort()).toEqual(
        seeded.teachers.map(t => t.displayName).sort()
      );
    });
  });

  describe('GET /api/v1/teachers/:teacherId', () => {
    it('有効なIDの教員を返す', async () => {
      const target = seeded.teachers[0];
      const res = await app.fetch(
        new Request(`http://example.com/api/v1/teachers/${target.teacherId}`),
        env
      );

      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        teacher_id: target.teacherId,
        user_id: target.userId,
        display_name: target.displayName,
      });
    });

    it('不正なIDの場合は400を返す', async () => {
      const res = await app.fetch(
        new Request('http://example.com/api/v1/teachers/abc'),
        env
      );
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid teacher ID' });
    });

    it('存在しないIDの場合は404を返す', async () => {
      const res = await app.fetch(
        new Request('http://example.com/api/v1/teachers/999999'),
        env
      );
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Teacher not found' });
    });
  });
});
