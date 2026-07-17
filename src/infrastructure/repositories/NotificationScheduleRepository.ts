import type { D1Database } from '@cloudflare/workers-types';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type {
  NotificationScheduleEntity,
  NotificationTargetToken,
} from '../../domain/entities/NotificationSchedule';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import * as schema from '../database/schema';
import {
  events,
  firebase_tokens,
  gathering_group_members,
  gatherings,
  notification_schedules,
  notifications,
  users,
} from '../database/schema';

const selection = {
  notification_send_schedule_id: notification_schedules.id,
  user_id: notification_schedules.userId,
  event_id: notification_schedules.eventId,
  gathering_group_id: notification_schedules.gatheringGroupId,
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

  const findById = async (scheduleId: number) =>
    orm
      .select(selection)
      .from(notification_schedules)
      .innerJoin(
        notifications,
        eq(notification_schedules.notificationId, notifications.notificationId)
      )
      .where(eq(notification_schedules.id, scheduleId))
      .get();

  return {
    async create(input) {
      const inserted = await orm
        .insert(notification_schedules)
        .values({
          userId: input.user_id,
          eventId: input.event_id,
          gatheringGroupId: input.gathering_group_id,
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

    async findAll() {
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
        .orderBy(asc(notification_schedules.sendAt))
        .all() as Promise<NotificationScheduleEntity[]>;
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

    async existsEventGatheringGroup(eventId, gatheringGroupId) {
      return Boolean(
        await orm
          .select({ id: gatherings.id })
          .from(gatherings)
          .innerJoin(events, eq(gatherings.eventId, events.id))
          .where(
            and(
              eq(gatherings.eventId, eventId),
              eq(gatherings.gatheringGroupId, gatheringGroupId)
            )
          )
          .get()
      );
    },

    async claimDue(now) {
      const candidates = await orm
        .select({ id: notification_schedules.id })
        .from(notification_schedules)
        .where(
          and(
            eq(notification_schedules.sendStatus, 'draft'),
            lte(notification_schedules.sendAt, now)
          )
        )
        .all();
      const claimed: NotificationScheduleEntity[] = [];
      for (const candidate of candidates) {
        const result = await orm
          .update(notification_schedules)
          .set({ sendStatus: 'sending', updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(
            and(
              eq(notification_schedules.id, candidate.id),
              eq(notification_schedules.sendStatus, 'draft')
            )
          )
          .returning({ id: notification_schedules.id })
          .get();
        if (!result) continue;
        const schedule = await findById(result.id);
        if (schedule) claimed.push(schedule as NotificationScheduleEntity);
      }
      return claimed;
    },

    async findTargetTokens(gatheringGroupId) {
      return orm
        .select({
          firebase_token_id: firebase_tokens.firebaseTokenId,
          fcm_token: firebase_tokens.fcmToken,
        })
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
        .all() as Promise<NotificationTargetToken[]>;
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
