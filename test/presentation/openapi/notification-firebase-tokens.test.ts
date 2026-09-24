import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  FirebaseTokenDTO,
  FirebaseTokenRegistrationRequestDTO,
} from '../../../src/application/dto/FirebaseTokenDTO';
import { z } from '../../../src/presentation/openapi/schemas';
import {
  firebaseTokenRegistrationRequestSchema,
  firebaseTokenSchema,
} from '../../../src/presentation/openapi/notification';
import { date, offsetDate } from './notification.fixtures';

describe('Firebase tokenのResponse schema', () => {
  it('POST/DELETEともisActiveを持たない', () => {
    expect(
      firebaseTokenRegistrationRequestSchema.safeParse({
        fcmToken: 'token',
        platform: 'ios',
      }).success
    ).toBe(true);
    expect(
      firebaseTokenSchema.safeParse({
        firebaseTokenId: 10,
        userId: 123,
        platform: 'ios',
        lastSeenAt: date,
      }).success
    ).toBe(true);
    expect(
      firebaseTokenSchema.safeParse({
        firebaseTokenId: 10,
        userId: 123,
        platform: 'ios',
        lastSeenAt: offsetDate,
      }).success
    ).toBe(false);
    expect(
      firebaseTokenSchema.safeParse({
        firebaseTokenId: 10,
        userId: 123,
        platform: 'ios',
        lastSeenAt: date,
        isActive: true,
      }).success
    ).toBe(false);
  });
});

describe('Firebase tokenのApplication DTOとOpenAPI schemaの型パリティ', () => {
  it('request/response DTOと一致する', () => {
    expectTypeOf<
      z.infer<typeof firebaseTokenRegistrationRequestSchema>
    >().toEqualTypeOf<FirebaseTokenRegistrationRequestDTO>();
    expectTypeOf<
      z.infer<typeof firebaseTokenSchema>
    >().toEqualTypeOf<FirebaseTokenDTO>();
  });
});
