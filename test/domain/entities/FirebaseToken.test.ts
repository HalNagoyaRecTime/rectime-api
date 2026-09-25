import { describe, expect, it } from 'vitest';
import {
  firebasePlatformToCode,
  firebasePlatformToName,
} from '../../../src/domain/entities/FirebaseToken';
import {
  FcmRequestError,
  isPermanentFcmTokenError,
} from '../../../src/application/services/IFcmService';

describe('Firebase platform mapping', () => {
  it('maps supported platform names and codes', () => {
    expect(firebasePlatformToCode('ios')).toBe(1);
    expect(firebasePlatformToCode('android')).toBe(2);
    expect(firebasePlatformToName(1)).toBe('ios');
    expect(firebasePlatformToName(2)).toBe('android');
  });

  it('rejects unknown stored platform codes', () => {
    expect(() => firebasePlatformToName(99)).toThrow(
      'Unsupported Firebase platform: 99'
    );
  });
});

describe('isPermanentFcmTokenError', () => {
  it('only treats UNREGISTERED as a structured permanent token error', () => {
    expect(
      isPermanentFcmTokenError(
        new FcmRequestError(404, 'UNREGISTERED', 'failed')
      )
    ).toBe(true);
    expect(
      isPermanentFcmTokenError(
        new FcmRequestError(400, 'INVALID_ARGUMENT', 'failed')
      )
    ).toBe(false);
  });

  it('does not treat INVALID_ARGUMENT text as permanent token failure', () => {
    expect(isPermanentFcmTokenError(new Error('INVALID_ARGUMENT'))).toBe(false);
  });
});
