import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createMasterImportController } from '../../../src/presentation/controllers/MasterImportController';
import type { IMasterImportService } from '../../../src/application/services/IMasterImportService';
import type { MasterImportSessionDTO } from '../../../src/application/dto/MasterImportDTO';

function buildSession(
  overrides: Partial<MasterImportSessionDTO> = {}
): MasterImportSessionDTO {
  return {
    validated_file_id: 'abc-123',
    type: 'students',
    status: 'validated',
    file_name: 'students.csv',
    total: 1,
    success_count: 1,
    error_count: 0,
    errors: [],
    rows: [],
    rows_total: 1,
    rows_limit: 100,
    rows_offset: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    expires_at: '2026-01-01T00:30:00.000Z',
    committed_result: null,
    ...overrides,
  };
}

function setup() {
  const masterImportService: IMasterImportService = {
    createImport: vi.fn(),
    getImport: vi.fn(),
    commitImport: vi.fn(),
  };
  const controller = createMasterImportController(masterImportService);
  const app = new Hono();
  app.post('/master-imports', c => controller.createImport(c));
  app.get('/master-imports/:validatedFileId', c => controller.getImport(c));
  app.post('/master-imports/:validatedFileId/commit', c =>
    controller.commitImport(c)
  );
  return { app, masterImportService };
}

describe('MasterImportController', () => {
  describe('createImport', () => {
    it('ファイルとtypeを受け取り、201でセッションを返す', async () => {
      const { app, masterImportService } = setup();
      const session = buildSession();
      (
        masterImportService.createImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(session);

      const formData = new FormData();
      formData.append('type', 'students');
      formData.append(
        'file',
        new File(['a,b\n1,2\n'], 'students.csv', { type: 'text/csv' })
      );

      const res = await app.request('/master-imports', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(session);
      expect(masterImportService.createImport).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'students', fileName: 'students.csv' })
      );
    });

    it('typeが不正な場合は400を返す', async () => {
      const { app, masterImportService } = setup();

      const formData = new FormData();
      formData.append('type', 'invalid');
      formData.append(
        'file',
        new File(['a,b\n1,2\n'], 'students.csv', { type: 'text/csv' })
      );

      const res = await app.request('/master-imports', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      expect(masterImportService.createImport).not.toHaveBeenCalled();
    });

    it('fileが無い場合は400を返す', async () => {
      const { app } = setup();

      const formData = new FormData();
      formData.append('type', 'students');

      const res = await app.request('/master-imports', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
    });

    it('サービスがエラーを投げた場合は400を返す', async () => {
      const { app, masterImportService } = setup();
      (
        masterImportService.createImport as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('bad file'));

      const formData = new FormData();
      formData.append('type', 'students');
      formData.append(
        'file',
        new File(['a,b\n1,2\n'], 'students.csv', { type: 'text/csv' })
      );

      const res = await app.request('/master-imports', {
        method: 'POST',
        body: formData,
      });

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'Failed to parse import file',
        details: 'bad file',
      });
    });
  });

  describe('getImport', () => {
    it('存在するvalidatedFileIdは200で返す', async () => {
      const { app, masterImportService } = setup();
      const session = buildSession();
      (
        masterImportService.getImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(session);

      const res = await app.request('/master-imports/abc-123');

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(session);
      expect(masterImportService.getImport).toHaveBeenCalledWith('abc-123', {
        offset: 0,
        limit: 100,
      });
    });

    it('存在しないvalidatedFileIdは404を返す', async () => {
      const { app, masterImportService } = setup();
      (
        masterImportService.getImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      const res = await app.request('/master-imports/nope');

      expect(res.status).toBe(404);
    });

    it('limitが2000を超える場合は400を返す', async () => {
      const { app } = setup();

      const res = await app.request('/master-imports/abc-123?limit=2001');

      expect(res.status).toBe(400);
    });
  });

  describe('commitImport', () => {
    it('新規に確定した場合は201を返す', async () => {
      const { app, masterImportService } = setup();
      const session = buildSession({ status: 'committed' });
      (
        masterImportService.commitImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        status: 'committed',
        session,
        alreadyCommitted: false,
      });

      const res = await app.request('/master-imports/abc-123/commit', {
        method: 'POST',
      });

      expect(res.status).toBe(201);
      expect(await res.json()).toEqual(session);
    });

    it('既に確定済みの場合は200を返す', async () => {
      const { app, masterImportService } = setup();
      const session = buildSession({ status: 'committed' });
      (
        masterImportService.commitImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        status: 'committed',
        session,
        alreadyCommitted: true,
      });

      const res = await app.request('/master-imports/abc-123/commit', {
        method: 'POST',
      });

      expect(res.status).toBe(200);
    });

    it('エラー行がある場合は422を返す', async () => {
      const { app, masterImportService } = setup();
      const session = buildSession({ error_count: 1 });
      (
        masterImportService.commitImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ status: 'has_errors', session });

      const res = await app.request('/master-imports/abc-123/commit', {
        method: 'POST',
      });

      expect(res.status).toBe(422);
    });

    it('存在しないvalidatedFileIdは404を返す', async () => {
      const { app, masterImportService } = setup();
      (
        masterImportService.commitImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ status: 'not_found' });

      const res = await app.request('/master-imports/nope/commit', {
        method: 'POST',
      });

      expect(res.status).toBe(404);
    });

    it('同時実行中の確定処理の完了を待ちきれなかった場合は503を返し、Retry-Afterを含む', async () => {
      const { app, masterImportService } = setup();
      (
        masterImportService.commitImport as ReturnType<typeof vi.fn>
      ).mockResolvedValue({ status: 'timeout' });

      const res = await app.request('/master-imports/abc-123/commit', {
        method: 'POST',
      });

      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('3');
      expect(await res.json()).toEqual({
        error: 'Commit is still in progress, please retry',
        error_code: 'COMMIT_IN_PROGRESS',
      });
    });
  });
});
