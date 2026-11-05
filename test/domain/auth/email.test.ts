import { describe, expect, it } from 'vitest';
import { pickMicrosoftEmailClaim } from '../../../src/domain/auth/email';

describe('pickMicrosoftEmailClaim', () => {
  it('preferred_usernameが空白でなければそれを優先する', () => {
    expect(
      pickMicrosoftEmailClaim({
        preferred_username: 'a@example.com',
        email: 'b@example.com',
      })
    ).toBe('a@example.com');
  });

  it('preferred_usernameが無い・空白ならemailへフォールバックする', () => {
    expect(pickMicrosoftEmailClaim({ email: 'b@example.com' })).toBe(
      'b@example.com'
    );
    expect(
      pickMicrosoftEmailClaim({
        preferred_username: '  ',
        email: 'b@example.com',
      })
    ).toBe('b@example.com');
  });

  it('どちらも使えない場合はundefinedを返す', () => {
    expect(pickMicrosoftEmailClaim({})).toBeUndefined();
    expect(
      pickMicrosoftEmailClaim({ preferred_username: ' ', email: '' })
    ).toBeUndefined();
    expect(
      pickMicrosoftEmailClaim({ preferred_username: 1, email: null })
    ).toBeUndefined();
  });

  it('値はtrimせずそのまま返す', () => {
    expect(
      pickMicrosoftEmailClaim({ preferred_username: ' a@example.com ' })
    ).toBe(' a@example.com ');
  });
});
