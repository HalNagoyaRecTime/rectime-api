import { describe, expect, it } from 'vitest';
import {
  CAMPUSES,
  parseCampus,
  resolveCampusFromEmail,
} from '../../../src/domain/auth/campus';

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

describe('resolveCampusFromEmail', () => {
  it('三校の学生・教員ドメインを対応する学校に判定する', () => {
    expect(resolveCampusFromEmail('a@nhs.hal.ac.jp')).toBe('NAGOYA');
    expect(resolveCampusFromEmail('a@nh.hal.ac.jp')).toBe('NAGOYA');
    expect(resolveCampusFromEmail('a@ohs.hal.ac.jp')).toBe('OSAKA');
    expect(resolveCampusFromEmail('a@oh.hal.ac.jp')).toBe('OSAKA');
    expect(resolveCampusFromEmail('a@ths.hal.ac.jp')).toBe('TOKYO');
    expect(resolveCampusFromEmail('a@th.hal.ac.jp')).toBe('TOKYO');
  });

  it('大文字や前後の空白を正規化して判定する', () => {
    expect(resolveCampusFromEmail('  A@OHS.HAL.AC.JP ')).toBe('OSAKA');
    expect(resolveCampusFromEmail('B@Th.Hal.Ac.Jp')).toBe('TOKYO');
  });

  it('一覧に無いドメインは名古屋校として扱う', () => {
    expect(resolveCampusFromEmail('a@gmail.com')).toBe('NAGOYA');
    expect(resolveCampusFromEmail('a@hal.ac.jp')).toBe('NAGOYA');
  });

  it('サブドメインは一致とみなさない', () => {
    expect(resolveCampusFromEmail('a@xxx.nhs.hal.ac.jp')).toBe('NAGOYA');
    expect(resolveCampusFromEmail('a@xxx.ohs.hal.ac.jp')).toBe('NAGOYA');
  });

  it('末尾が異なる類似ドメインは一致とみなさない', () => {
    expect(resolveCampusFromEmail('a@foo.ohs.hal.ac.jp.evil.com')).toBe(
      'NAGOYA'
    );
    expect(resolveCampusFromEmail('a@ohs.hal.ac.jp.example')).toBe('NAGOYA');
  });

  it('未設定・不正なメールは名古屋校として扱う', () => {
    expect(resolveCampusFromEmail(null)).toBe('NAGOYA');
    expect(resolveCampusFromEmail(undefined)).toBe('NAGOYA');
    expect(resolveCampusFromEmail('')).toBe('NAGOYA');
    expect(resolveCampusFromEmail('not-an-email')).toBe('NAGOYA');
    expect(resolveCampusFromEmail('a@b@ohs.hal.ac.jp')).toBe('NAGOYA');
  });
});
