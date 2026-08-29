import { DurableObject } from 'cloudflare:workers';

const LOCK_TIMEOUT_MS = 60 * 1000;

type LockState = { token: string; startedAt: number };

export class MasterImportCommitLock extends DurableObject {
  async tryBeginCommit(): Promise<string | null> {
    const current = await this.ctx.storage.get<LockState>('lock');
    if (
      current !== undefined &&
      Date.now() - current.startedAt < LOCK_TIMEOUT_MS
    ) {
      return null;
    }
    const token = crypto.randomUUID();
    await this.ctx.storage.put('lock', { token, startedAt: Date.now() });
    return token;
  }

  async releaseLock(token: string): Promise<void> {
    const current = await this.ctx.storage.get<LockState>('lock');
    if (current?.token === token) {
      await this.ctx.storage.delete('lock');
    }
  }
}
