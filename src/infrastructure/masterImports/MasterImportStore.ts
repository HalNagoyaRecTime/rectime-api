import type { KVNamespace } from '@cloudflare/workers-types';
import type { MasterImportSession } from '../../domain/entities/MasterImport';

const TTL_SECONDS = 60 * 60 * 24;

function key(importId: string): string {
  return `master-import:${importId}`;
}

export async function saveMasterImportSession(
  kv: KVNamespace,
  session: MasterImportSession
): Promise<void> {
  await kv.put(key(session.import_id), JSON.stringify(session), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function getMasterImportSession(
  kv: KVNamespace,
  importId: string
): Promise<MasterImportSession | null> {
  const raw = await kv.get(key(importId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as MasterImportSession;
}
