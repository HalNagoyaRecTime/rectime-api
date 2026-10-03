import { describe, expect, it } from 'vitest';
import { classifyFcmError } from '../../../src/application/services/NotificationRetryService';
import { FcmRequestError } from '../../../src/application/services/IFcmService';
import { parseRetryAfter } from '../../../src/infrastructure/services/FcmService';

describe('FCM error分類', () => {
  it.each(['INVALID_ARGUMENT', 'SENDER_ID_MISMATCH', 'THIRD_PARTY_AUTH_ERROR'])(
    '%sを恒久失敗にする',
    code => {
      expect(classifyFcmError(new FcmRequestError(400, code, '失敗'))).toBe(
        'permanent'
      );
    }
  );
  it.each(['INTERNAL', 'UNAVAILABLE', 'QUOTA_EXCEEDED'])(
    '%sを再送する',
    code => {
      expect(classifyFcmError(new FcmRequestError(503, code, '失敗'))).toBe(
        'temporary'
      );
    }
  );
  it('UNREGISTEREDだけToken削除とし、文字列からToken削除を推測しない', () => {
    expect(
      classifyFcmError(new FcmRequestError(404, 'UNREGISTERED', '失敗'))
    ).toBe('unregistered');
    expect(classifyFcmError(new Error('invalid token'))).toBe('temporary');
    expect(classifyFcmError(new FcmRequestError(401, null, '認証失敗'))).toBe(
      'permanent'
    );
  });
  it('Retry-Afterの秒数・HTTP日付・不正値を処理する', () => {
    expect(parseRetryAfter('90')).toBe(90);
    expect(
      parseRetryAfter(
        'Sat, 03 Oct 2026 00:01:30 GMT',
        Date.parse('2026-10-03T00:00:00Z')
      )
    ).toBe(90);
    expect(parseRetryAfter('-1')).toBeNull();
    expect(parseRetryAfter('不正')).toBeNull();
    expect(parseRetryAfter(null)).toBeNull();
  });
});
