import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';

function getLock(name: string) {
  const id = env.MASTER_IMPORT_COMMIT_LOCK.idFromName(name);
  return env.MASTER_IMPORT_COMMIT_LOCK.get(id);
}

describe('MasterImportCommitLock', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('最初のtryBeginCommitは成功し、直後の呼び出しは失敗する', async () => {
    const lock = getLock('lock-basic');

    expect(await lock.tryBeginCommit()).toBe(true);
    expect(await lock.tryBeginCommit()).toBe(false);
  });

  it('releaseLockを呼んだ後は、再度tryBeginCommitが成功する', async () => {
    const lock = getLock('lock-release');

    expect(await lock.tryBeginCommit()).toBe(true);
    await lock.releaseLock();
    expect(await lock.tryBeginCommit()).toBe(true);
  });

  it('ロック取得から一定時間以内は、releaseLockが呼ばれなくても失敗し続ける', async () => {
    vi.useFakeTimers();
    const lock = getLock('lock-not-expired');

    expect(await lock.tryBeginCommit()).toBe(true);
    await vi.advanceTimersByTimeAsync(59_000);
    expect(await lock.tryBeginCommit()).toBe(false);
  });

  it('ロック取得から一定時間経過すると、releaseLockが呼ばれなくても再取得できる', async () => {
    vi.useFakeTimers();
    const lock = getLock('lock-expired');

    expect(await lock.tryBeginCommit()).toBe(true);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await lock.tryBeginCommit()).toBe(true);
  });
});
