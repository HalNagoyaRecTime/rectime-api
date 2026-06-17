import { D1Database } from '@cloudflare/workers-types';
import { createFcmService } from './FcmService';

type ScheduledNotificationEnv = {
  DB: D1Database;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  TEST_FCM_TOKEN: string;
};

type ScheduledEventRow = {
  f_event_id: number;
  f_event_name: string;
  f_time: string;
  f_place: string;
};

type FirebaseTokenRow = {
  id: number;
  user_id: number;
  fcm_token: string;
};

export async function sendScheduledEventNotifications(
  env: ScheduledNotificationEnv,
  now = new Date()
): Promise<{ checkedEvents: number; sent: number; failed: number }> {
  const targetTime = getJstHmm(addMinutes(now, 10));
  const today = getJstDate(now);
  const events = await findEventsStartingAt(env.DB, targetTime);
  const fcmService = createFcmService({
    projectId: env.FIREBASE_PROJECT_ID,
    clientEmail: env.FIREBASE_CLIENT_EMAIL,
    privateKey: env.FIREBASE_PRIVATE_KEY,
    testFcmToken: env.TEST_FCM_TOKEN,
  });
  let sent = 0;
  let failed = 0;

  for (const event of events) {
    const tokens = await findActiveFirebaseTokensForEvent(
      env.DB,
      event.f_event_id
    );

    for (const token of tokens) {
      const alreadySent = await hasAlreadySent(env.DB, {
        eventId: event.f_event_id,
        firebaseTokenId: token.id,
        scheduledForDate: today,
      });

      if (alreadySent) {
        continue;
      }

      const notificationId = await createScheduledNotificationIfMissing(
        env.DB,
        {
          userId: token.user_id,
          event,
          scheduledForDate: today,
        }
      );

      try {
        const result = await fcmService.sendNotificationToToken({
          token: token.fcm_token,
          title: '呼び出し通知',
          body: `${event.f_event_name}の開始10分前です。${event.f_place}に集合してください。`,
          data: {
            type: 'event_reminder',
            eventId: String(event.f_event_id),
          },
        });

        await recordSentNotification(env.DB, {
          eventId: event.f_event_id,
          firebaseTokenId: token.id,
          scheduledForDate: today,
          messageId: result.messageId,
        });
        await updateNotificationSendStatus(env.DB, notificationId, 'sent');
        sent += 1;
      } catch (error) {
        failed += 1;
        await updateNotificationSendStatus(env.DB, notificationId, 'failed');

        if (shouldDeactivateToken(error)) {
          await deactivateFirebaseToken(env.DB, token.id);
        }

        console.error('Failed to send scheduled notification', error);
      }
    }
  }

  return {
    checkedEvents: events.length,
    sent,
    failed,
  };
}

async function findEventsStartingAt(
  db: D1Database,
  hmm: string
): Promise<ScheduledEventRow[]> {
  const result = await db
    .prepare(
      `
      SELECT f_event_id, f_event_name, f_time, f_place
      FROM t_events
      WHERE f_time = ?
      ORDER BY f_event_id
      `
    )
    .bind(hmm)
    .all<Record<string, unknown>>();

  return result.results.map(row => ({
    f_event_id: row.f_event_id as number,
    f_event_name: row.f_event_name as string,
    f_time: row.f_time as string,
    f_place: row.f_place as string,
  }));
}

async function findActiveFirebaseTokensForEvent(
  db: D1Database,
  eventId: number
): Promise<FirebaseTokenRow[]> {
  const result = await db
    .prepare(
      `
      SELECT ft.id, ft.user_id, ft.fcm_token
      FROM firebase_tokens ft
      INNER JOIN users u
        ON u.id = ft.user_id
      INNER JOIN m_students s
        ON s.f_student_num = u.student_number
      INNER JOIN t_entries e
        ON e.f_student_id = s.f_student_id
      WHERE e.f_event_id = ?
        AND ft.is_active = 1
        AND u.is_active = 1
      ORDER BY ft.id
      `
    )
    .bind(eventId)
    .all<Record<string, unknown>>();

  return result.results.map(row => ({
    id: row.id as number,
    user_id: row.user_id as number,
    fcm_token: row.fcm_token as string,
  }));
}

async function createScheduledNotificationIfMissing(
  db: D1Database,
  input: {
    userId: number;
    event: ScheduledEventRow;
    scheduledForDate: string;
  }
): Promise<number> {
  const existing = await db
    .prepare(
      `
      SELECT id
      FROM notifications
      WHERE user_id = ?
        AND type = 'event_reminder_10min'
        AND resource_type = 'event'
        AND resource_id = ?
        AND substr(sent_at, 1, 10) = ?
      `
    )
    .bind(input.userId, String(input.event.f_event_id), input.scheduledForDate)
    .first();

  if (existing && 'id' in existing && typeof existing.id === 'number') {
    return existing.id;
  }

  const inserted = await db
    .prepare(
      `
      INSERT INTO notifications (
        user_id,
        type,
        title,
        body,
        link_url,
        resource_type,
        resource_id,
        severity,
        send_status,
        sent_at,
        updated_at
      )
      VALUES (?, 'event_reminder_10min', ?, ?, ?, 'event', ?, 'info', 'pending', ?, CURRENT_TIMESTAMP)
      RETURNING id
      `
    )
    .bind(
      input.userId,
      '呼び出し通知',
      `${input.event.f_event_name}の開始10分前です。${input.event.f_place}に集合してください。`,
      `/events/${input.event.f_event_id}`,
      String(input.event.f_event_id),
      new Date().toISOString()
    )
    .first<Record<string, unknown>>();

  if (!inserted || typeof inserted.id !== 'number') {
    throw new Error('Failed to create scheduled notification');
  }

  return inserted.id;
}

async function updateNotificationSendStatus(
  db: D1Database,
  notificationId: number,
  sendStatus: 'sent' | 'failed'
) {
  await db
    .prepare(
      `
      UPDATE notifications
      SET send_status = CASE
            WHEN send_status = 'sent' THEN send_status
            ELSE ?
          END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    )
    .bind(sendStatus, notificationId)
    .run();
}

async function hasAlreadySent(
  db: D1Database,
  input: {
    eventId: number;
    firebaseTokenId: number;
    scheduledForDate: string;
  }
): Promise<boolean> {
  const result = await db
    .prepare(
      `
      SELECT id
      FROM notification_send_logs
      WHERE event_id = ?
        AND firebase_token_id = ?
        AND notification_type = 'event_reminder_10min'
        AND scheduled_for_date = ?
      `
    )
    .bind(input.eventId, input.firebaseTokenId, input.scheduledForDate)
    .first();

  return Boolean(result);
}

async function recordSentNotification(
  db: D1Database,
  input: {
    eventId: number;
    firebaseTokenId: number;
    scheduledForDate: string;
    messageId: string;
  }
) {
  await db
    .prepare(
      `
      INSERT INTO notification_send_logs (
        event_id,
        firebase_token_id,
        notification_type,
        scheduled_for_date,
        fcm_message_id
      )
      VALUES (?, ?, 'event_reminder_10min', ?, ?)
      `
    )
    .bind(
      input.eventId,
      input.firebaseTokenId,
      input.scheduledForDate,
      input.messageId
    )
    .run();
}

async function deactivateFirebaseToken(
  db: D1Database,
  firebaseTokenId: number
) {
  await db
    .prepare(
      `
      UPDATE firebase_tokens
      SET is_active = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `
    )
    .bind(firebaseTokenId)
    .run();
}

function shouldDeactivateToken(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('UNREGISTERED') ||
    message.includes('invalid token') ||
    message.includes('INVALID_ARGUMENT')
  );
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function getJstHmm(date: Date): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(date).replace(':', '');
}

function getJstDate(date: Date): string {
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}
