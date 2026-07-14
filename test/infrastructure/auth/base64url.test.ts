import { describe, expect, it } from 'vitest';
import {
  base64URLtoBytes,
  base64URLtoString,
  pemToBytes,
  toBase64URL,
  utf8BytesToString,
} from '../../../src/infrastructure/auth/base64url';

describe('base64url', () => {
  describe('toBase64URL / base64URLtoBytes', () => {
    it('バイト列を base64url にエンコードし、デコードで元に戻る', () => {
      const original = new Uint8Array([0, 1, 2, 253, 254, 255, 128, 64]);

      const encoded = toBase64URL(original);
      const decoded = base64URLtoBytes(encoded);

      expect(encoded).not.toMatch(/[+/=]/);
      expect(Array.from(decoded)).toEqual(Array.from(original));
    });

    it('パディングが必要な長さでも正しくデコードできる', () => {
      // 1バイト・2バイト・3バイトでパディング数が変わるケースを網羅する
      for (const original of [
        new Uint8Array([1]),
        new Uint8Array([1, 2]),
        new Uint8Array([1, 2, 3]),
      ]) {
        const decoded = base64URLtoBytes(toBase64URL(original));
        expect(Array.from(decoded)).toEqual(Array.from(original));
      }
    });
  });

  describe('utf8BytesToString / base64URLtoString', () => {
    it('UTF-8 バイト列を文字列に変換できる（マルチバイト文字を含む）', () => {
      const text = 'こんにちは123';
      const bytes = new TextEncoder().encode(text);

      expect(utf8BytesToString(bytes)).toBe(text);
    });

    it('base64url 文字列を元の文字列にデコードできる', () => {
      const text = 'hello world こんにちは';
      const encoded = toBase64URL(new TextEncoder().encode(text));

      expect(base64URLtoString(encoded)).toBe(text);
    });
  });

  describe('pemToBytes', () => {
    it('PEM のヘッダー・フッター・改行を除去してデコードする', () => {
      const raw = new Uint8Array([10, 20, 30, 40, 50]);
      const base64 = toBaseStd(raw);
      const pem = `-----BEGIN PRIVATE KEY-----\n${base64}\n-----END PRIVATE KEY-----\n`;

      const bytes = new Uint8Array(pemToBytes(pem));

      expect(Array.from(bytes)).toEqual(Array.from(raw));
    });
  });
});

function toBaseStd(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
