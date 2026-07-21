import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, count, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { NotificationScheduleEntity } from '../../domain/entities/NotificationSchedule';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import * as schema from '../database/schema';
import {
  events,
  firebase_tokens,
  gathering_group_members,
  notification_schedules,
  notifications,
  users,
} from '../database/schema';

const selection = {
  notification_send_schedule_id: notification_schedules.id,
  created_user_id: notification_schedules.createdUserId,
  event_id: notification_schedules.eventId,
  firebase_token_id: notification_schedules.firebaseTokenId,
  fcm_token: firebase_tokens.fcmToken,
  notification_id: notification_schedules.notificationId,
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
      .innerJoin(
        firebase_tokens,
        eq(
          notification_schedules.firebaseTokenId,
          firebase_tokens.firebaseTokenId
        )
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
          eventId: input.event_id,
          firebaseTokenId: input.firebase_token_id,
          notificationId: input.notification_id,
          importance: input.importance,
          sendAt: input.send_at,
        })
        .returning({ id: notification_schedules.id })
        .get();
      const schedule = inserted && (await findById(inserted.id));
      if (!schedule) throw new Error('Failed to create notification schedule');
      return schedule as NotificationScheduleEntity;
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
          .innerJoin(
            firebase_tokens,
            eq(
              notification_schedules.firebaseTokenId,
              firebase_tokens.firebaseTokenId
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

    async findDraftsByEventAndTokens(eventId, firebaseTokenIds) {
      if (firebaseTokenIds.length === 0) return [];
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
        .innerJoin(
          firebase_tokens,
          eq(
            notification_schedules.firebaseTokenId,
            firebase_tokens.firebaseTokenId
          )
        )
        .where(
          and(
            eq(notification_schedules.eventId, eventId),
            inArray(notification_schedules.firebaseTokenId, firebaseTokenIds),
            eq(notification_schedules.sendStatus, 'draft')
          )
        )
        .orderBy(asc(notification_schedules.id))
        .all() as Promise<NotificationScheduleEntity[]>;
    },

    async updateDraft(notificationScheduleId, input) {
      const updated = await orm
        .update(notification_schedules)
        .set({
          notificationId: input.notification_id,
          sendAt: input.send_at,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(notification_schedules.id, notificationScheduleId),
            eq(notification_schedules.sendStatus, 'draft')
          )
        )
        .returning({ id: notification_schedules.id })
        .get();
      return updated ? findById(updated.id) : null;
    },

    async existsUser(userId) {
      return Boolean(
        await orm
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
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

    async findActiveFirebaseTokenIdsByGatheringGroup(gatheringGroupId) {
      const rows = await orm
        .select({ firebaseTokenId: firebase_tokens.firebaseTokenId })
        .from(gathering_group_members)
        .innerJoin(
          firebase_tokens,
          eq(gathering_group_members.userId, firebase_tokens.userId)
        )
        .where(
          and(
            eq(gathering_group_members.gatheringGroupId, gatheringGroupId),
            eq(firebase_tokens.isFirebaseActive, 1)
          )
        )
        .orderBy(asc(firebase_tokens.firebaseTokenId))
        .all();
      return rows.map(row => row.firebaseTokenId);
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

    async existsFirebaseToken(firebaseTokenId) {
      return Boolean(
        await orm
          .select({ id: firebase_tokens.firebaseTokenId })
          .from(firebase_tokens)
          .where(eq(firebase_tokens.firebaseTokenId, firebaseTokenId))
          .get()
      );
    },

    async claimDue(now) {
      const claimed = await orm
        .update(notification_schedules)
        .set({ sendStatus: 'sending', updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(
          and(
            eq(notification_schedules.sendStatus, 'draft'),
            sql`datetime(${notification_schedules.sendAt}) <= datetime(${now})`
          )
        )
        .returning({ id: notification_schedules.id })
        .all();
      if (claimed.length === 0) return [];

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
            claimed.map(schedule => schedule.id)
          )
        )
        .orderBy(
          asc(notification_schedules.sendAt),
          asc(notification_schedules.id)
        )
        .all() as Promise<NotificationScheduleEntity[]>;
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
