import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationSendLogRepository } from '../../../src/infrastructure/repositories/NotificationSendLogRepository';
import type { INotificationSendLogRepository } from '../../../src/domain/interfaces/repositories/INotificationSendLogRepository';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import { seedEvents, type SeededEventData } from '../../fixtures/events';

describe('NotificationSendLogRepository', () => {
  let repo: INotificationSendLogRepository;
  let seeded: SeededEventData;
  let firebaseTokenId: number;

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM notification_send_logs').run();
    await env.DB.prepare('DELETE FROM firebase_tokens').run();
    await env.DB.prepare('DELETE FROM auth_users').run();
    seeded = await seedEvents(env.DB);

    const firebaseTokenRepository = createFirebaseTokenRepository(env.DB);
    const { firebaseToken } = await firebaseTokenRepository.register({
      studentNumber: '10000',
      platform: 'android',
      fcmToken: 'token-a',
    });
    firebaseTokenId = firebaseToken.id;

    repo = createNotificationSendLogRepository(env.DB);
  });

  describe('hasAlreadySent / record', () => {
    it('未記録の場合は hasAlreadySent が false を返す', async () => {
      const eventId = seeded.events[0].eventId;

      const result = await repo.hasAlreadySent({
        eventId,
        firebaseTokenId,
        scheduledForDate: '2026-01-01',
      });

      expect(result).toBe(false);
    });

    it('record したあとは同じキーで hasAlreadySent が true を返す', async () => {
      const eventId = seeded.events[0].eventId;

      await repo.record({
        eventId,
        firebaseTokenId,
        scheduledForDate: '2026-01-01',
        messageId: 'msg-1',
      });

      const result = await repo.hasAlreadySent({
        eventId,
        firebaseTokenId,
        scheduledForDate: '2026-01-01',
      });

      expect(result).toBe(true);
    });

    it('日付が異なる場合は hasAlreadySent が false のままになる', async () => {
      const eventId = seeded.events[0].eventId;

      await repo.record({
        eventId,
        firebaseTokenId,
        scheduledForDate: '2026-01-01',
        messageId: 'msg-1',
      });

      const result = await repo.hasAlreadySent({
        eventId,
        firebaseTokenId,
        scheduledForDate: '2026-01-02',
      });

      expect(result).toBe(false);
    });
  });
});
