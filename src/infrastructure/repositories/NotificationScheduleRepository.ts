import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  DueNotificationSchedule,
  NotificationScheduleEntity,
} from '../../domain/entities/NotificationSchedule';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import * as schema from '../database/schema';
import {
  firebase_tokens,
  notification_schedules,
  notifications,
  users,
} from '../database/schema';

type NotificationScheduleRow = Omit<
  NotificationScheduleEntity,
  'send_status'
> & { send_status: string };

type DueNotificationScheduleRow = NotificationScheduleRow & {
  fcm_token: string;
  platform: number;
  is_firebase_active: number;
  is_user_live_active: number;
};

function toNotificationScheduleEntity(
  row: NotificationScheduleRow
): NotificationScheduleEntity {
  switch (row.send_status) {
    case 'draft':
    case 'sending':
    case 'sent':
    case 'failed':
      return { ...row, send_status: row.send_status };
    default:
      throw new Error(
        `Unexpected notification send status: ${row.send_status}`
      );
  }
}

function toDueNotificationSchedule(
  row: DueNotificationScheduleRow
): DueNotificationSchedule {
  if (row.firebase_token_id === null) {
    throw new Error('A due notification schedule must reference a token');
  }
  if (row.platform !== 1 && row.platform !== 2) {
    throw new Error(`Unexpected Firebase platform: ${row.platform}`);
  }

  return {
    ...toNotificationScheduleEntity(row),
    firebase_token_id: row.firebase_token_id,
    fcm_token: row.fcm_token,
    platform: row.platform,
    is_firebase_active: row.is_firebase_active,
    is_user_live_active: row.is_user_live_active,
  };
}

const selection = {
  notification_schedule_id: notification_schedules.id,
  created_user_id: notification_schedules.createdUserId,
  event_id: notification_schedules.eventId,
  notification_id: notification_schedules.notificationId,
  firebase_token_id: notification_schedules.firebaseTokenId,
  importance: notification_schedules.importance,
  notification_type: notifications.notificationType,
  title: notifications.title,
  body: notifications.body,
  send_status: notification_schedules.sendStatus,
  fcm_message_id: notification_schedules.fcmMessageId,
  failed_reason: notification_schedules.failedReason,
  send_at: notification_schedules.sendAt,
  created_at: notification_schedules.createdAt,
  updated_at: notification_schedules.updatedAt,
};

export function createNotificationScheduleRepository(
  db: D1Database
): INotificationScheduleRepository {
  const orm = drizzle(db, { schema });

  return {
    async findDraftsByEvent(eventId) {
      const rows = await orm
        .select(selection)
        .from(notification_schedules)
        .innerJoin(
          notifications,
          eq(
            notification_schedules.notificationId,
            notifications.notificationId
          )
        )
        .where(
          and(
            eq(notification_schedules.eventId, eventId),
            eq(notification_schedules.sendStatus, 'draft'),
            eq(notifications.notificationType, 'event_reminder')
          )
        )
        .orderBy(asc(notification_schedules.id))
        .all();
      return rows.map(toNotificationScheduleEntity);
    },

    async findDeliveryCandidateIds(dueAt, staleBefore, limit) {
      const rows = await orm
        .select({ id: notification_schedules.id })
        .from(notification_schedules)
        .where(
          and(
            isNotNull(notification_schedules.firebaseTokenId),
            sql`datetime(${notification_schedules.sendAt}) <= datetime(${dueAt})`,
            or(
              eq(notification_schedules.sendStatus, 'draft'),
              and(
                eq(notification_schedules.sendStatus, 'sending'),
                sql`datetime(${notification_schedules.updatedAt}) <= datetime(${staleBefore})`
              )
            )
          )
        )
        .orderBy(
          asc(notification_schedules.sendAt),
          asc(notification_schedules.id)
        )
        .limit(limit)
        .all();
      return rows.map(row => row.id);
    },

    async claimForDelivery(notificationScheduleIds, dueAt, staleBefore) {
      if (notificationScheduleIds.length === 0) return [];

      const claimed = await orm
        .update(notification_schedules)
        .set({ sendStatus: 'sending', updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(
          and(
            inArray(notification_schedules.id, notificationScheduleIds),
            isNotNull(notification_schedules.firebaseTokenId),
            sql`datetime(${notification_schedules.sendAt}) <= datetime(${dueAt})`,
            or(
              eq(notification_schedules.sendStatus, 'draft'),
              and(
                eq(notification_schedules.sendStatus, 'sending'),
                sql`datetime(${notification_schedules.updatedAt}) <= datetime(${staleBefore})`
              )
            )
          )
        )
        .returning({ id: notification_schedules.id })
        .all();
      if (claimed.length === 0) return [];

      // 宛先Userの稼働状態は予定作成時ではなく送信時に判定する。無効化中に
      // 送信時刻を迎えた予定だけを送らずに済ませ、再有効化後の予定は
      // そのまま届くようにするため。判定自体は呼び出し元が行う。
      const rows = await orm
        .select({
          ...selection,
          fcm_token: firebase_tokens.fcmToken,
          platform: firebase_tokens.platform,
          is_firebase_active: firebase_tokens.isFirebaseActive,
          is_user_live_active: users.isLiveActive,
        })
        .from(notification_schedules)
        .innerJoin(
          notifications,
          eq(
            notification_schedules.notificationId,
            notifications.notificationId
          )
        )
        .innerJoin(
          firebase_tokens,
          eq(
            notification_schedules.firebaseTokenId,
            firebase_tokens.firebaseTokenId
          )
        )
        .innerJoin(users, eq(firebase_tokens.userId, users.id))
        .where(
          inArray(
            notification_schedules.id,
            claimed.map(row => row.id)
          )
        )
        .orderBy(
          asc(notification_schedules.sendAt),
          asc(notification_schedules.id)
        )
        .all();
      return rows.map(toDueNotificationSchedule);
    },

    async markSent(scheduleId, fcmMessageId) {
      await orm
        .update(notification_schedules)
        .set({
          sendStatus: 'sent',
          fcmMessageId,
          failedReason: null,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(notification_schedules.id, scheduleId),
            eq(notification_schedules.sendStatus, 'sending')
          )
        )
        .run();
    },

    async markFailed(scheduleId, reason) {
      await orm
        .update(notification_schedules)
        .set({
          sendStatus: 'failed',
          failedReason: reason,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(notification_schedules.id, scheduleId),
            eq(notification_schedules.sendStatus, 'sending')
          )
        )
        .run();
    },

    async anonymizeCreatedUserId(userId) {
      await orm
        .update(notification_schedules)
        .set({ createdUserId: null, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(notification_schedules.createdUserId, userId))
        .run();
    },

    async deleteByFirebaseTokenId(firebaseTokenId) {
      await orm
        .delete(notification_schedules)
        .where(eq(notification_schedules.firebaseTokenId, firebaseTokenId))
        .run();
    },
  };
}
