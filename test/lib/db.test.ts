import { describe, expect, it } from 'vitest';
import { getDb } from '../../src/lib/db';
import type { Env } from '../../src/lib/env';

describe('getDb', () => {
  it('env.DB が存在する場合はそれを返す', () => {
    const fakeDb = {} as Env['DB'];
    const env = { DB: fakeDb } as Env;

    expect(getDb(env)).toBe(fakeDb);
  });

  it('env が undefined の場合はエラーを投げる', () => {
    expect(() => getDb(undefined)).toThrow('DB binding not found');
  });

  it('env.DB が無い場合はエラーを投げる', () => {
    expect(() => getDb({} as Env)).toThrow('DB binding not found');
  });
});
