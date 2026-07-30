import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, count, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  DueNotificationSchedule,
  NotificationScheduleEntity,
} from '../../domain/entities/NotificationSchedule';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import * as schema from '../database/schema';
import {
  events,
  firebase_tokens,
  notification_schedules,
  notifications,
} from '../database/schema';

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

  const findById = async (
    scheduleId: number
  ): Promise<NotificationScheduleEntity | null> => {
    const row = await orm
      .select(selection)
      .from(notification_schedules)
      .innerJoin(
        notifications,
        eq(notification_schedules.notificationId, notifications.notificationId)
      )
      .where(eq(notification_schedules.id, scheduleId))
      .get();
    return (row as NotificationScheduleEntity | undefined) ?? null;
  };

  return {
    async create(input) {
      const inserted = await orm
        .insert(notification_schedules)
        .values({
          createdUserId: input.created_user_id,
          eventId: input.event_id ?? null,
          notificationId: input.notification_id,
          firebaseTokenId: input.firebase_token_id,
          importance: input.importance ?? 2,
          sendAt: input.send_at,
        })
        .returning({ id: notification_schedules.id })
        .get();
      const schedule = inserted && (await findById(inserted.id));
      if (!schedule) throw new Error('Failed to create notification schedule');
      return schedule;
    },

    async findAll(options) {
      const conditions: SQL[] = [];
      if (options.send_status) {
        conditions.push(
          eq(notification_schedules.sendStatus, options.send_status)
        );
      }
      if (options.event_id !== undefined) {
        conditions.push(eq(notification_schedules.eventId, options.event_id));
      }
      if (options.created_user_id !== undefined) {
        conditions.push(
          eq(notification_schedules.createdUserId, options.created_user_id)
        );
      }
      if (options.firebase_token_id !== undefined) {
        conditions.push(
          eq(notification_schedules.firebaseTokenId, options.firebase_token_id)
        );
      }
      if (options.from) {
        conditions.push(
          sql`datetime(${notification_schedules.sendAt}) >= datetime(${options.from})`
        );
      }
      if (options.to) {
        conditions.push(
          sql`datetime(${notification_schedules.sendAt}) <= datetime(${options.to})`
        );
      }
      const where = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, totalResult] = await Promise.all([
        orm
          .select(selection)
          .from(notification_schedules)
          .innerJoin(
            notifications,
            eq(
              notification_schedules.notificationId,
              notifications.notificationId
            )
          )
          .where(where)
          .orderBy(
            asc(notification_schedules.sendAt),
            asc(notification_schedules.id)
          )
          .limit(options.limit)
          .offset(options.offset)
          .all(),
        orm
          .select({ total: count() })
          .from(notification_schedules)
          .where(where)
          .get(),
      ]);
      return {
        notification_schedules: rows as NotificationScheduleEntity[],
        total: totalResult?.total ?? 0,
      };
    },

    findById,

    async deleteDraft(notificationScheduleId) {
      const deleted = await orm
        .delete(notification_schedules)
        .where(
          and(
            eq(notification_schedules.id, notificationScheduleId),
            eq(notification_schedules.sendStatus, 'draft')
          )
        )
        .returning({ id: notification_schedules.id })
        .get();
      if (deleted) return 'deleted';
      const existing = await orm
        .select({ id: notification_schedules.id })
        .from(notification_schedules)
        .where(eq(notification_schedules.id, notificationScheduleId))
        .get();
      return existing ? 'not_draft' : 'not_found';
    },

    async findDraftsByEvent(eventId) {
      return orm
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
        .all() as Promise<NotificationScheduleEntity[]>;
    },

    async existsFirebaseToken(firebaseTokenId) {
      return Boolean(
        await orm
          .select({ id: firebase_tokens.firebaseTokenId })
          .from(firebase_tokens)
          .where(eq(firebase_tokens.firebaseTokenId, firebaseTokenId))
          .get()
      );
    },

    async existsEvent(eventId) {
      return Boolean(
        await orm
          .select({ id: events.id })
          .from(events)
          .where(eq(events.id, eventId))
          .get()
      );
    },

    async existsNotification(notificationId) {
      return Boolean(
        await orm
          .select({ id: notifications.notificationId })
          .from(notifications)
          .where(eq(notifications.notificationId, notificationId))
          .get()
      );
    },

    async findDeliveryCandidateIds(dueAt, staleBefore, limit) {
      const rows = await orm
        .select({ id: notification_schedules.id })
        .from(notification_schedules)
        .where(
          and(
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

      return orm
        .select({
          ...selection,
          fcm_token: firebase_tokens.fcmToken,
          is_firebase_active: firebase_tokens.isFirebaseActive,
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
        .all() as Promise<DueNotificationSchedule[]>;
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
  };
}
