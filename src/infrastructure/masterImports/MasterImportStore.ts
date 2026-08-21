import type { KVNamespace } from '@cloudflare/workers-types';
import type { MasterImportSession } from '../../domain/entities/MasterImport';

export const TTL_SECONDS = 60 * 30;

// 本体が消えた後も「このIDは存在した」と判定するための墓標キーの保持期間（暫定）
const TOMBSTONE_TTL_SECONDS = 60 * 60 * 24 * 7;

function key(validatedFileId: string): string {
  return `master-import:${validatedFileId}`;
}

function tombstoneKey(validatedFileId: string): string {
  return `master-import-meta:${validatedFileId}`;
}

export async function saveMasterImportSession(
  kv: KVNamespace,
  session: MasterImportSession
): Promise<void> {
  await kv.put(key(session.validated_file_id), JSON.stringify(session), {
    expirationTtl: TTL_SECONDS,
  });
  // 墓標は期限切れ判定の補助情報のため、失敗しても取込自体は成功させる
  try {
    await kv.put(
      tombstoneKey(session.validated_file_id),
      JSON.stringify({ created_at: session.created_at }),
      { expirationTtl: TOMBSTONE_TTL_SECONDS }
    );
  } catch (error) {
    console.warn(
      `[master-import] failed to save tombstone: ${session.validated_file_id}`,
      error
    );
  }
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

export async function hasMasterImportTombstone(
  kv: KVNamespace,
  validatedFileId: string
): Promise<boolean> {
  return (await kv.get(tombstoneKey(validatedFileId))) !== null;
}
