import { describe, expect, it } from 'vitest';
import { CAMPUSES, parseCampus } from '../../../src/domain/auth/campus';

describe('parseCampus', () => {
  it('一覧にある学校コードをそのまま返す', () => {
    expect(CAMPUSES).toEqual(['NAGOYA', 'OSAKA', 'TOKYO']);
    for (const campus of CAMPUSES) {
      expect(parseCampus(campus)).toBe(campus);
    }
  });

  it('未設定・一覧に無い値はnullを返す', () => {
    expect(parseCampus(undefined)).toBeNull();
    expect(parseCampus('')).toBeNull();
    expect(parseCampus('FUKUOKA')).toBeNull();
  });

  it('大文字小文字や前後の空白が違う値は不正として扱う', () => {
    expect(parseCampus('Osaka')).toBeNull();
    expect(parseCampus('osaka')).toBeNull();
    expect(parseCampus(' OSAKA')).toBeNull();
  });
});
