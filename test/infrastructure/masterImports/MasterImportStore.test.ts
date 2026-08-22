import { describe, expect, it, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  getMasterImportSession,
  saveMasterImportSession,
} from '../../../src/infrastructure/masterImports/MasterImportStore';
import type { MasterImportSession } from '../../../src/domain/entities/MasterImport';

function createFakeKv(getResult: string | null = null): KVNamespace {
  return {
    put: vi.fn(async () => {}),
    get: vi.fn(async () => getResult),
  } as unknown as KVNamespace;
}

function buildSession(
  overrides: Partial<MasterImportSession> = {}
): MasterImportSession {
  return {
    validated_file_id: 'file-1',
    create_user_id: 1,
    type: 'students',
    status: 'validated',
    file_name: 's.csv',
    total: 1,
    success_count: 1,
    error_count: 0,
    errors: [],
    rows: [],
    created_at: '2026-08-18T00:00:00.000Z',
    committed_result: null,
    ...overrides,
  };
}

describe('MasterImportStore', () => {
  describe('saveMasterImportSession', () => {
    it('expirationTtlを1800秒に指定してKVへ保存する', async () => {
      const kv = createFakeKv();
      const session = buildSession();

      await saveMasterImportSession(kv, session);

      expect(kv.put).toHaveBeenCalledTimes(1);
      expect(kv.put).toHaveBeenCalledWith(
        `master-import:${session.validated_file_id}`,
        JSON.stringify(session),
        { expirationTtl: 1800 }
      );
    });
  });

  describe('getMasterImportSession', () => {
    it('KVに存在しない場合はnullを返す', async () => {
      const kv = createFakeKv(null);

      const result = await getMasterImportSession(kv, 'nope');

      expect(result).toBeNull();
      expect(kv.get).toHaveBeenCalledWith('master-import:nope');
    });

    it('KVに存在する場合はパース済みセッションを返す', async () => {
      const session = buildSession();
      const kv = createFakeKv(JSON.stringify(session));

      const result = await getMasterImportSession(
        kv,
        session.validated_file_id
      );

      expect(result).toEqual(session);
      expect(kv.get).toHaveBeenCalledWith(
        `master-import:${session.validated_file_id}`
      );
    });
  });
});
