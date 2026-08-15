import { DurableObject } from 'cloudflare:workers';

const LOCK_TIMEOUT_MS = 60 * 1000;

export class MasterImportCommitLock extends DurableObject {
  async tryBeginCommit(): Promise<boolean> {
    const startedAt = await this.ctx.storage.get<number>(
      'committingStartedAt'
    );
    if (startedAt !== undefined && Date.now() - startedAt < LOCK_TIMEOUT_MS) {
      return false;
    }
    await this.ctx.storage.put('committingStartedAt', Date.now());
    return true;
  }

  async releaseLock(): Promise<void> {
    await this.ctx.storage.delete('committingStartedAt');
  }
}
