import { describe, expect, it } from 'vitest';
import {
  extractStudentIdNumber,
  isStudentEmail,
} from '../../../src/domain/auth/email';

const campuses = [
  { name: '名古屋', prefix: 'nhs', domain: 'nhs.hal.ac.jp' },
  { name: '大阪', prefix: 'ohs', domain: 'ohs.hal.ac.jp' },
  { name: '東京', prefix: 'ths', domain: 'ths.hal.ac.jp' },
];

describe.each(campuses)('$nameの学生メール', ({ prefix, domain }) => {
  it('学校の接頭辞に続く学籍番号を先頭ゼロも含めて取得する', () => {
    const email = `${prefix}00123@${domain}`;

    expect(extractStudentIdNumber(email, domain)).toBe('00123');
    expect(isStudentEmail(email, domain)).toBe(true);
  });

  it('学生メール判定では前後の空白と大文字を正規化する', () => {
    expect(
      isStudentEmail(
        `  ${prefix.toUpperCase()}00123@${domain.toUpperCase()}  `,
        ` ${domain.toUpperCase()} `
      )
    ).toBe(true);
  });

  it.each(campuses.filter(campus => campus.prefix !== prefix))(
    '$nameの接頭辞やドメインを混ぜたメールは受け付けない',
    other => {
      for (const email of [
        `${other.prefix}00123@${domain}`,
        `${prefix}00123@${other.domain}`,
        `${other.prefix}00123@${other.domain}`,
      ]) {
        expect(extractStudentIdNumber(email, domain)).toBeNull();
        expect(isStudentEmail(email, domain)).toBe(false);
      }
    }
  );

  it.each(['', 'abc', '123abc', 'abc123', '１２３', '-123', '12 3'])(
    '学籍番号部分が「%s」の場合は学生メールとみなさない',
    studentId => {
      const email = `${prefix}${studentId}@${domain}`;
      expect(extractStudentIdNumber(email, domain)).toBeNull();
      expect(isStudentEmail(email, domain)).toBe(false);
    }
  );
});

describe('学生メールの不正な入力', () => {
  it.each(['', 'nhs00123', '@nhs.hal.ac.jp', 'nhs00123@@nhs.hal.ac.jp'])(
    '不正なメール「%s」は受け付けない',
    email => {
      expect(extractStudentIdNumber(email, 'nhs.hal.ac.jp')).toBeNull();
      expect(isStudentEmail(email, 'nhs.hal.ac.jp')).toBe(false);
    }
  );

  it.each(['', '.hal.ac.jp'])(
    '接頭辞が空の設定「%s」は受け付けない',
    domain => {
      const email = `00123@${domain}`;
      expect(extractStudentIdNumber(email, domain)).toBeNull();
      expect(isStudentEmail(email, domain)).toBe(false);
    }
  );
});

describe('接頭辞の正規表現エスケープ', () => {
  it.each([
    'nhs+',
    'n(h)s',
    'n[h]s',
    'nhs\\',
    'nhs$',
    'nhs|ohs',
    'nhs*',
    'nhs?',
    'nhs^',
    'nhs{2}',
  ])('接頭辞「%s」を正規表現ではなく文字列として照合する', prefix => {
    const domain = `${prefix}.hal.ac.jp`;
    const email = `${prefix}00123@${domain}`;
    expect(extractStudentIdNumber(email, domain)).toBe('00123');
    expect(isStudentEmail(email, domain)).toBe(true);
  });

  it('正規表現としてなら一致する別の接頭辞を受け付けない', () => {
    const domain = 'nhs+.hal.ac.jp';
    const email = `nhss00123@${domain}`;
    expect(extractStudentIdNumber(email, domain)).toBeNull();
    expect(isStudentEmail(email, domain)).toBe(false);
  });
});
