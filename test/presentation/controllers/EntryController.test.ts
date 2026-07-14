import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createEntryController } from '../../../src/presentation/controllers/EntryController';
import type { IEntryService } from '../../../src/application/services/IEntryService';
import type { EntryEntity } from '../../../src/domain/entities/Entry';

function buildEntry(overrides: Partial<EntryEntity> = {}): EntryEntity {
  return {
    f_entry_id: 1,
    f_student_id: 10,
    f_event_id: 100,
    ...overrides,
  };
}

function setup() {
  const entryService: IEntryService = {
    getAllEntries: vi.fn(),
    getEntryById: vi.fn(),
  };
  const controller = createEntryController(entryService);
  const app = new Hono();
  app.get('/entries', c => controller.getAllEntries(c));
  app.get('/entries/:entryId', c => controller.getEntryById(c));
  return { app, entryService };
}

describe('EntryController', () => {
  describe('getAllEntries', () => {
    it('クエリパラメータを解析せず常に空オブジェクトでサービスを呼び出す', async () => {
      const { app, entryService } = setup();
      const entries = [buildEntry()];
      (
        entryService.getAllEntries as ReturnType<typeof vi.fn>
      ).mockResolvedValue(entries);

      const res = await app.request(
        '/entries?studentId=10&eventId=100&limit=5&offset=1'
      );

      expect(entryService.getAllEntries).toHaveBeenCalledWith({});
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(entries);
    });

    it('サービスが例外を投げた場合は 500 を返す', async () => {
      const { app, entryService } = setup();
      (
        entryService.getAllEntries as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const res = await app.request('/entries');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch entries' });
      consoleErrorSpy.mockRestore();
    });
  });

  describe('getEntryById', () => {
    it('存在するエントリーを 200 で返す', async () => {
      const { app, entryService } = setup();
      const entry = buildEntry();
      (entryService.getEntryById as ReturnType<typeof vi.fn>).mockResolvedValue(
        entry
      );

      const res = await app.request('/entries/1');

      expect(entryService.getEntryById).toHaveBeenCalledWith(1);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(entry);
    });

    it('数値でない ID の場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/entries/abc');

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Invalid entry ID' });
    });

    it('サービスが Entry not found を投げた場合は 404 を返す', async () => {
      const { app, entryService } = setup();
      (entryService.getEntryById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Entry not found')
      );

      const res = await app.request('/entries/999');

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'Entry not found' });
    });

    it('その他の例外の場合は 500 を返す', async () => {
      const { app, entryService } = setup();
      (entryService.getEntryById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('db error')
      );

      const res = await app.request('/entries/1');

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'Failed to fetch entry' });
    });
  });
});
