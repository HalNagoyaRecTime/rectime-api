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
import { firebaseTokenRegistrationRoute } from '../../../src/presentation/openapi/notification/firebaseTokens';

describe('Firebase tokenのResponse schema', () => {
  it('POSTのstatus契約をPhase 0に揃える', () => {
    expect(
      Object.keys(firebaseTokenRegistrationRoute.responses)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual([200, 400, 401, 500]);
  });
  it('POST契約はlegacy isActiveを持たない', () => {
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
