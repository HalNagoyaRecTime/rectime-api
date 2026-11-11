import { describe, expect, it, vi } from 'vitest';
import { createSharedResultCache } from '../../../src/application/services/SharedResultCache';

const TTL_MS = 60_000;

function createClock() {
  let current = 0;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    },
  };
}

describe('SharedResultCache', () => {
  it('期限内は同じキーの結果を読み直さずに返す', async () => {
    const clock = createClock();
    const cache = createSharedResultCache<string>(TTL_MS, clock.now);
    const load = vi.fn().mockResolvedValueOnce('first');

    await cache.get('key', load);
    clock.advance(TTL_MS - 1);

    expect(await cache.get('key', load)).toBe('first');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('期限が来たら読み直す', async () => {
    const clock = createClock();
    const cache = createSharedResultCache<string>(TTL_MS, clock.now);
    const load = vi
      .fn()
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    await cache.get('key', load);
    clock.advance(TTL_MS);

    expect(await cache.get('key', load)).toBe('second');
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('キーが違えば別々に読む', async () => {
    const cache = createSharedResultCache<string>(TTL_MS);

    expect(await cache.get('a', async () => 'a')).toBe('a');
    expect(await cache.get('b', async () => 'b')).toBe('b');
  });

  it('読み込み中に同じキーで呼ばれたら、読み込み中の結果を待たずに自分で読む', async () => {
    const cache = createSharedResultCache<string>(TTL_MS);
    let resolveFirst: (value: string) => void = () => {};
    const firstLoad = vi.fn(
      () =>
        new Promise<string>(resolve => {
          resolveFirst = resolve;
        })
    );
    const secondLoad = vi.fn().mockResolvedValue('second');

    const first = cache.get('key', firstLoad);
    const second = cache.get('key', secondLoad);

    expect(await second).toBe('second');
    expect(secondLoad).toHaveBeenCalledTimes(1);
    resolveFirst('first');
    expect(await first).toBe('first');
  });

  it('先に読み始めた結果が後から終わっても、後に読み始めた結果を残す', async () => {
    const clock = createClock();
    const cache = createSharedResultCache<string>(TTL_MS, clock.now);
    let resolveOlder: (value: string) => void = () => {};
    const olderLoad = vi.fn(
      () =>
        new Promise<string>(resolve => {
          resolveOlder = resolve;
        })
    );

    const older = cache.get('key', olderLoad);
    clock.advance(1);
    expect(await cache.get('key', async () => 'newer')).toBe('newer');
    resolveOlder('older');
    expect(await older).toBe('older');

    const reload = vi.fn().mockResolvedValue('reloaded');
    expect(await cache.get('key', reload)).toBe('newer');
    expect(reload).not.toHaveBeenCalled();
  });

  it('読み込みに失敗した結果は使い回さない', async () => {
    const cache = createSharedResultCache<string>(TTL_MS);
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('D1 unavailable'))
      .mockResolvedValueOnce('recovered');

    await expect(cache.get('key', load)).rejects.toThrow('D1 unavailable');

    expect(await cache.get('key', load)).toBe('recovered');
  });
});
