export interface SharedResultCache<T> {
  get: (key: string, load: () => Promise<T>) => Promise<T>;
}

export function createSharedResultCache<T>(
  ttlMs: number,
  now: () => number = () => Date.now()
): SharedResultCache<T> {
  const entries = new Map<
    string,
    { startedAt: number; expiresAt: number; value: T }
  >();

  return {
    async get(key, load) {
      const cached = entries.get(key);
      if (cached && cached.expiresAt > now()) return cached.value;

      // 読み込み中の Promise を別リクエストに待たせると、Workers ではリクエストを
      // またいだ I/O になり失敗や待ちっぱなしになりうるため、読み終えた値だけを残す。
      const startedAt = now();
      const value = await load();
      const current = now();
      for (const [entryKey, entry] of entries) {
        if (entry.expiresAt <= current) entries.delete(entryKey);
      }
      const latest = entries.get(key);
      if (!latest || latest.startedAt <= startedAt) {
        entries.set(key, { startedAt, expiresAt: startedAt + ttlMs, value });
      }
      return value;
    },
  };
}
