import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationAccountDeletionRepository } from '../../../src/infrastructure/repositories/NotificationAccountDeletionRepository';

describe('NotificationAccountDeletionRepository', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_push_deliveries'),
      env.DB.prepare('DELETE FROM notification_recipients'),
      env.DB.prepare('DELETE FROM notification_audiences'),
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM event_venues'),
      env.DB.prepare('DELETE FROM venues'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM microsoft_account_links'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('対象Recipientだけを日時付きで匿名化し、Recipient・Deliveryを保持する', async () => {
    const targetUser = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('Recipient anonymization target') RETURNING user_id"
    ).first<{ user_id: number }>();
    const otherUser = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('Recipient anonymization other') RETURNING user_id"
    ).first<{ user_id: number }>();
    const notification = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('notification_general', 'Repository test', 'Body', 'Repository test', 'Body') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    const schedule = await env.DB.prepare(
      "INSERT INTO notification_schedules (notification_id, send_status, send_at) VALUES (?, 'sent', '2026-10-01T00:00:00.000Z') RETURNING notification_schedule_id"
    )
      .bind(notification!.notification_id)
      .first<{ notification_schedule_id: number }>();
    const targetRecipient = await env.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING notification_recipient_id'
    )
      .bind(
        schedule!.notification_schedule_id,
        targetUser!.user_id,
        '2026-10-01T00:01:00.000Z',
        '2026-10-01T00:01:00.000Z'
      )
      .first<{ notification_recipient_id: number }>();
    const otherRecipient = await env.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id, created_at, updated_at) VALUES (?, ?, ?, ?) RETURNING notification_recipient_id'
    )
      .bind(
        schedule!.notification_schedule_id,
        otherUser!.user_id,
        '2026-10-01T00:02:00.000Z',
        '2026-10-01T00:02:00.000Z'
      )
      .first<{ notification_recipient_id: number }>();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO notification_push_deliveries (notification_recipient_id, platform, status) VALUES (?, 1, 'sent')"
      ).bind(targetRecipient!.notification_recipient_id),
      env.DB.prepare(
        "INSERT INTO notification_push_deliveries (notification_recipient_id, platform, status) VALUES (?, 1, 'failed')"
      ).bind(otherRecipient!.notification_recipient_id),
    ]);

    await createNotificationAccountDeletionRepository(
      env.DB
    ).anonymizeRecipientsByUserId(targetUser!.user_id);

    const recipients = await env.DB.prepare(
      'SELECT notification_recipient_id, user_id, updated_at FROM notification_recipients WHERE notification_schedule_id = ? ORDER BY notification_recipient_id'
    )
      .bind(schedule!.notification_schedule_id)
      .all<{
        notification_recipient_id: number;
        user_id: number | null;
        updated_at: string | null;
      }>();
    expect(recipients.results).toEqual([
      {
        notification_recipient_id: targetRecipient!.notification_recipient_id,
        user_id: null,
        updated_at: expect.stringMatching(
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        ),
      },
      {
        notification_recipient_id: otherRecipient!.notification_recipient_id,
        user_id: otherUser!.user_id,
        updated_at: '2026-10-01T00:02:00.000Z',
      },
    ]);
    const deliveries = await env.DB.prepare(
      'SELECT notification_recipient_id, status FROM notification_push_deliveries ORDER BY notification_recipient_id'
    ).all<{ notification_recipient_id: number; status: string }>();
    expect(deliveries.results).toEqual([
      {
        notification_recipient_id: targetRecipient!.notification_recipient_id,
        status: 'sent',
      },
      {
        notification_recipient_id: otherRecipient!.notification_recipient_id,
        status: 'failed',
      },
    ]);
  });
});
