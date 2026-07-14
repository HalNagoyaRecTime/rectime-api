import { describe, expect, it } from 'vitest';
import {
  generateCodeChallenge,
  generateRandom,
} from '../../../src/infrastructure/auth/pkce';

describe('pkce', () => {
  describe('generateRandom', () => {
    it('指定バイト長のランダムな base64url 文字列を生成する', () => {
      const value = generateRandom(32);

      expect(value).not.toMatch(/[+/=]/);
      expect(value.length).toBeGreaterThan(0);
    });

    it('呼び出すたびに異なる値を生成する', () => {
      const a = generateRandom(32);
      const b = generateRandom(32);

      expect(a).not.toBe(b);
    });
  });

  describe('generateCodeChallenge', () => {
    it('同じ code_verifier からは常に同じ challenge を生成する（SHA-256 決定的）', async () => {
      const verifier = 'test-code-verifier-value';

      const challengeA = await generateCodeChallenge(verifier);
      const challengeB = await generateCodeChallenge(verifier);

      expect(challengeA).toBe(challengeB);
      expect(challengeA).not.toMatch(/[+/=]/);
    });

    it('異なる code_verifier からは異なる challenge を生成する', async () => {
      const challengeA = await generateCodeChallenge('verifier-a');
      const challengeB = await generateCodeChallenge('verifier-b');

      expect(challengeA).not.toBe(challengeB);
    });
  });
});
