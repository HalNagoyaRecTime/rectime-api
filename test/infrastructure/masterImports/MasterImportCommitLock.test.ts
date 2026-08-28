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

  it('最初のtryBeginCommitはトークンを返し、直後の呼び出しはnullを返す', async () => {
    const lock = getLock('lock-basic');

    const token = await lock.tryBeginCommit();
    expect(token).not.toBeNull();
    expect(await lock.tryBeginCommit()).toBeNull();
  });

  it('取得時のトークンでreleaseLockした後は、再度tryBeginCommitが成功する', async () => {
    const lock = getLock('lock-release');

    const token = await lock.tryBeginCommit();
    await lock.releaseLock(token as string);
    expect(await lock.tryBeginCommit()).not.toBeNull();
  });

  it('自分が取得した時のものではないトークンでreleaseLockしても、今のロックは解放されない', async () => {
    const lock = getLock('lock-wrong-token');

    await lock.tryBeginCommit();
    await lock.releaseLock('not-the-real-token');
    expect(await lock.tryBeginCommit()).toBeNull();
  });

  it('ロック取得から一定時間以内は、releaseLockが呼ばれなくても失敗し続ける', async () => {
    vi.useFakeTimers();
    const lock = getLock('lock-not-expired');

    await lock.tryBeginCommit();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(await lock.tryBeginCommit()).toBeNull();
  });

  it('ロック取得から一定時間経過すると、releaseLockが呼ばれなくても再取得できる', async () => {
    vi.useFakeTimers();
    const lock = getLock('lock-expired');

    await lock.tryBeginCommit();
    await vi.advanceTimersByTimeAsync(60_001);
    expect(await lock.tryBeginCommit()).not.toBeNull();
  });

  it('タイムアウトで奪われた古いトークンでreleaseLockしても、新しく取得された側のロックは残る', async () => {
    vi.useFakeTimers();
    const lock = getLock('lock-stale-release');

    const staleToken = await lock.tryBeginCommit();
    await vi.advanceTimersByTimeAsync(60_001);
    const newToken = await lock.tryBeginCommit();

    await lock.releaseLock(staleToken as string);

    expect(await lock.tryBeginCommit()).toBeNull();
    expect(newToken).not.toBe(staleToken);
  });
});
