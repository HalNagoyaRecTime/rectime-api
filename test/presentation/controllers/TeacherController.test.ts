import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createTeacherController } from '../../../src/presentation/controllers/TeacherController';
import type { ITeacherService } from '../../../src/application/services/ITeacherService';

function setup() {
  const teacherService: ITeacherService = {
    validateTeacherImport: vi.fn(),
    commitTeacherImport: vi.fn(),
  };
  const controller = createTeacherController(teacherService);
  const app = new Hono();
  app.post('/teachers/master-imports/validate', c =>
    controller.validateTeacherImport(c)
  );
  app.post('/teachers/master-imports/commit', c =>
    controller.commitTeacherImport(c)
  );
  return { app, teacherService };
}

describe('TeacherController', () => {
  describe('validateTeacherImport', () => {
    const validRow = { last_name: '田中', first_name: '太郎' };

    it('サービスの検査結果をそのまま200で返す', async () => {
      const { app, teacherService } = setup();
      const result = {
        total: 1,
        success_count: 1,
        error_count: 0,
        errors: [],
      };
      (
        teacherService.validateTeacherImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/teachers/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
      expect(teacherService.validateTeacherImport).toHaveBeenCalledWith({
        rows: [validRow],
      });
    });

    it('rowsが空配列の場合は400を返す', async () => {
      const { app, teacherService } = setup();

      const res = await app.request('/teachers/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(teacherService.validateTeacherImport).not.toHaveBeenCalled();
    });

    it('last_nameが欠けている場合は400を返す', async () => {
      const { app } = setup();
      const rowWithoutLastName: Record<string, unknown> = { ...validRow };
      delete rowWithoutLastName.last_name;

      const res = await app.request('/teachers/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [rowWithoutLastName] }),
      });

      expect(res.status).toBe(400);
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.validateTeacherImport as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/teachers/master-imports/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to validate teacher import',
      });
    });
  });

  describe('commitTeacherImport', () => {
    const validRow = { last_name: '田中', first_name: '太郎' };

    it('全行成功の場合は201で結果を返す', async () => {
      const { app, teacherService } = setup();
      const result = { total: 1, imported: 1, error_count: 0, errors: [] };
      (
        teacherService.commitTeacherImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/teachers/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(result);
    });

    it('rowsが空配列の場合は400を返す', async () => {
      const { app, teacherService } = setup();

      const res = await app.request('/teachers/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [] }),
      });

      expect(res.status).toBe(400);
      expect(teacherService.commitTeacherImport).not.toHaveBeenCalled();
    });

    it('サービスが例外を投げた場合は500を返す', async () => {
      const { app, teacherService } = setup();
      (
        teacherService.commitTeacherImport as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));

      const res = await app.request('/teachers/master-imports/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: [validRow] }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to commit teacher import',
      });
    });
  });
});
