import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationAccountDeletionService } from '../src/application/services/NotificationAccountDeletionService';
import { createFirebaseTokenRepository } from '../src/infrastructure/repositories/FirebaseTokenRepository';
import { createNotificationAccountDeletionRepository } from '../src/infrastructure/repositories/NotificationAccountDeletionRepository';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import { app } from '../src/index';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'm'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };

describe('GET /me/notificationsとRecipient匿名化', () => {
  beforeEach(async () => {
    await workerEnv.DB.batch([
      workerEnv.DB.prepare('DELETE FROM notification_push_deliveries'),
      workerEnv.DB.prepare('DELETE FROM notification_recipients'),
      workerEnv.DB.prepare('DELETE FROM notification_audiences'),
      workerEnv.DB.prepare('DELETE FROM notification_schedules'),
      workerEnv.DB.prepare('DELETE FROM notifications'),
      workerEnv.DB.prepare('DELETE FROM gathering_group_members'),
      workerEnv.DB.prepare('DELETE FROM gatherings'),
      workerEnv.DB.prepare('DELETE FROM event_venues'),
      workerEnv.DB.prepare('DELETE FROM venues'),
      workerEnv.DB.prepare('DELETE FROM events'),
      workerEnv.DB.prepare('DELETE FROM gathering_spots'),
      workerEnv.DB.prepare('DELETE FROM firebase_tokens'),
      workerEnv.DB.prepare('DELETE FROM microsoft_account_links'),
      workerEnv.DB.prepare('DELETE FROM staffs'),
      workerEnv.DB.prepare('DELETE FROM teachers'),
      workerEnv.DB.prepare('DELETE FROM students'),
      workerEnv.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('匿名化Recipientを別Userの本人通知履歴に返さない', async () => {
    const deletedUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('通知履歴匿名化対象') RETURNING user_id"
    ).first<{ user_id: number }>();
    const authenticatedUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('通知履歴確認User') RETURNING user_id"
    ).first<{ user_id: number }>();
    const deletedToken = await workerEnv.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, ?) RETURNING firebase_token_id'
    )
      .bind(deletedUser!.user_id, 'mobile-anonymization-deleted-token')
      .first<{ firebase_token_id: number }>();
    await workerEnv.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, ?)'
    )
      .bind(authenticatedUser!.user_id, 'mobile-anonymization-active-token')
      .run();
    const notification = await workerEnv.DB.prepare(
      "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('notification_general', '匿名化履歴', 'Push本文', '匿名化履歴', '履歴本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    const schedule = await workerEnv.DB.prepare(
      "INSERT INTO notification_schedules (notification_id, firebase_token_id, send_status, send_at) VALUES (?, ?, 'sent', '2026-10-01T10:00:00.000Z') RETURNING notification_schedule_id"
    )
      .bind(notification!.notification_id, deletedToken!.firebase_token_id)
      .first<{ notification_schedule_id: number }>();
    const recipient = await workerEnv.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING notification_recipient_id'
    )
      .bind(
        schedule!.notification_schedule_id,
        deletedUser!.user_id,
        '2026-10-01T10:00:00.000Z',
        '2026-10-01T10:00:00.000Z'
      )
      .first<{ notification_recipient_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status, attempt_count, sent_at) VALUES (?, ?, 1, 'sent', 1, '2026-10-01T10:01:00.000Z')"
    )
      .bind(
        recipient!.notification_recipient_id,
        deletedToken!.firebase_token_id
      )
      .run();

    await createNotificationAccountDeletionService({
      firebaseTokenRepository: createFirebaseTokenRepository(workerEnv.DB),
      notificationAccountDeletionRepository:
        createNotificationAccountDeletionRepository(workerEnv.DB),
    }).purgeUserNotificationData(deletedUser!.user_id);

    const anonymousRecipient = await workerEnv.DB.prepare(
      'SELECT notification_recipient_id, user_id FROM notification_recipients WHERE notification_recipient_id = ?'
    )
      .bind(recipient!.notification_recipient_id)
      .first<{ notification_recipient_id: number; user_id: number | null }>();
    expect(anonymousRecipient).toEqual({
      notification_recipient_id: recipient!.notification_recipient_id,
      user_id: null,
    });

    const accessToken = await signAccessToken(
      {
        sub: String(authenticatedUser!.user_id),
        oid: `notification-history-${authenticatedUser!.user_id}`,
        email: 'history-test@example.test',
        display_name: '通知履歴確認User',
        client_type: 'mobile',
      },
      JWT_SECRET,
      3600
    );
    const response = await app.fetch(
      new Request('http://example.com/api/v1/me/notifications', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Client-Type': 'mobile',
        },
      }),
      testEnv
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      notifications: [],
      total: 0,
    });
    const delivery = await workerEnv.DB.prepare(
      'SELECT notification_push_delivery_id, firebase_token_id, status FROM notification_push_deliveries WHERE notification_recipient_id = ?'
    )
      .bind(recipient!.notification_recipient_id)
      .first<{
        notification_push_delivery_id: number;
        firebase_token_id: number | null;
        status: string;
      }>();
    expect(delivery).toMatchObject({
      firebase_token_id: null,
      status: 'sent',
    });
  });
});
