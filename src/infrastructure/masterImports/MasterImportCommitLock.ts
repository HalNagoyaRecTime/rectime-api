import { DurableObject } from 'cloudflare:workers';

export class MasterImportCommitLock extends DurableObject {
  async tryBeginCommit(): Promise<boolean> {
    const alreadyStarted = await this.ctx.storage.get<boolean>('committing');
    if (alreadyStarted) {
      return false;
    }
    await this.ctx.storage.put('committing', true);
    return true;
  }
}
