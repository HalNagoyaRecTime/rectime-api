import type { KVNamespace } from '@cloudflare/workers-types';
import type { MasterImportSession } from '../../domain/entities/MasterImport';

export const TTL_SECONDS = 60 * 30;

function key(validatedFileId: string): string {
  return `master-import:${validatedFileId}`;
}

export async function saveMasterImportSession(
  kv: KVNamespace,
  session: MasterImportSession
): Promise<void> {
  await kv.put(key(session.validated_file_id), JSON.stringify(session), {
    expirationTtl: TTL_SECONDS,
  });
}

export async function getMasterImportSession(
  kv: KVNamespace,
  validatedFileId: string
): Promise<MasterImportSession | null> {
  const raw = await kv.get(key(validatedFileId));
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as MasterImportSession;
}
