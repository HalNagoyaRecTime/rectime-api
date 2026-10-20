import { describe, expect, it, vi } from 'vitest';
import { createNotificationAccountDeletionService } from '../../../src/application/services/NotificationAccountDeletionService';

describe('NotificationAccountDeletionService', () => {
  it('Audience・Recipient・Token・actor cleanupを順に実行する', async () => {
    const order: string[] = [];
    const firebaseTokenRepository = {
      findAllByUserId: vi.fn(async () => {
        order.push('findTokens');
        return [{ firebase_token_id: 21 }, { firebase_token_id: 22 }] as never;
      }),
      deleteByUserId: vi.fn(async () => {
        order.push('deleteTokens');
      }),
    };
    const notificationScheduleRepository = {
      deleteByFirebaseTokenId: vi.fn(async () => {
        order.push('deleteLegacySchedules');
      }),
      anonymizeCreatedUserId: vi.fn(async () => {
        order.push('anonymizeActors');
      }),
    };
    const notificationAccountDeletionRepository = {
      deleteDirectUserAudiencesByUserId: vi.fn(async () => {
        order.push('deleteAudiences');
      }),
      anonymizeRecipientsByUserId: vi.fn(async () => {
        order.push('anonymizeRecipients');
      }),
      anonymizeV2ActorReferences: vi.fn(async () => {
        order.push('anonymizeV2Actors');
      }),
    };
    const service = createNotificationAccountDeletionService({
      firebaseTokenRepository,
      notificationScheduleRepository,
      notificationAccountDeletionRepository,
    });

    await expect(service.purgeUserNotificationData(123)).resolves.toEqual({
      firebaseTokensDeleted: true,
    });
    expect(order).toEqual([
      'findTokens',
      'deleteAudiences',
      'anonymizeRecipients',
      'deleteLegacySchedules',
      'deleteLegacySchedules',
      'deleteTokens',
      'anonymizeActors',
      'anonymizeV2Actors',
    ]);
    expect(
      notificationAccountDeletionRepository.anonymizeRecipientsByUserId
    ).toHaveBeenCalledWith(123);
  });

  it('Tokenが無い場合もRecipientとactorをcleanupし、再実行できる', async () => {
    const firebaseTokenRepository = {
      findAllByUserId: vi.fn().mockResolvedValue([]),
      deleteByUserId: vi.fn(),
    };
    const notificationScheduleRepository = {
      deleteByFirebaseTokenId: vi.fn(),
      anonymizeCreatedUserId: vi.fn().mockResolvedValue(undefined),
    };
    const notificationAccountDeletionRepository = {
      deleteDirectUserAudiencesByUserId: vi.fn().mockResolvedValue(undefined),
      anonymizeRecipientsByUserId: vi.fn().mockResolvedValue(undefined),
      anonymizeV2ActorReferences: vi.fn().mockResolvedValue(undefined),
    };
    const service = createNotificationAccountDeletionService({
      firebaseTokenRepository,
      notificationScheduleRepository,
      notificationAccountDeletionRepository,
    });

    await expect(service.purgeUserNotificationData(123)).resolves.toEqual({
      firebaseTokensDeleted: false,
    });
    await expect(service.purgeUserNotificationData(123)).resolves.toEqual({
      firebaseTokensDeleted: false,
    });
    expect(firebaseTokenRepository.deleteByUserId).not.toHaveBeenCalled();
    expect(
      notificationAccountDeletionRepository.anonymizeRecipientsByUserId
    ).toHaveBeenCalledTimes(2);
  });
});
