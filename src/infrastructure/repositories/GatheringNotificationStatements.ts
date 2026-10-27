import { and, eq, exists, inArray, isNull, notExists, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { GatheringNotificationChanges } from '../../domain/interfaces/transactions/IGatheringSettingsTransaction';
import { AUTOMATIC_SYNC_PENDING_REASON } from '../../domain/entities/NotificationCreation';
import {
  gatherings,
  notifications,
  notification_schedules,
} from '../database/schema';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from '../database/schema';
import { buildNotificationStopStatements } from './NotificationStopStatements';

// 通知の同期保留・削除・停止SQLを構築する。ここではbatchを実行しない。
export function buildGatheringNotificationStatements(
  orm: DrizzleD1Database<typeof schema>,
  eventId: number,
  options: GatheringNotificationChanges
): BatchItem<'sqlite'>[] {
  const notificationCleanup = options.notificationCleanup;
  const cleanupStatements: BatchItem<'sqlite'>[] = [];
  if (notificationCleanup && notificationCleanup.gathering_ids.length > 0) {
    const stopPolicy = notificationCleanup.stop_policy;
    // cleanup対象も event_id で限定する。delete_ids に他EventのIDが混ざっても、
    // そのEventの通知を削除・停止しない。
    const ownedGatheringIds = () =>
      orm
        .select({ gatheringId: gatherings.id })
        .from(gatherings)
        .where(
          and(
            eq(gatherings.eventId, eventId),
            inArray(gatherings.id, notificationCleanup.gathering_ids)
          )
        );

    const sourceNotificationIds = () =>
      orm
        .select({ notificationId: notifications.notificationId })
        .from(notifications)
        .where(
          and(
            eq(notifications.sourceType, 'gathering'),
            inArray(notifications.sourceId, ownedGatheringIds()),
            eq(notifications.notificationType, 'notification_general')
          )
        );

    const sourceNotificationCondition = () =>
      and(
        eq(notifications.sourceType, 'gathering'),
        inArray(notifications.sourceId, ownedGatheringIds()),
        eq(notifications.notificationType, 'notification_general')
      );

    cleanupStatements.push(
      // 配信開始済みScheduleと未送信Deliveryは公開Stopと同じSQLで停止する。
      ...buildNotificationStopStatements(
        orm,
        stopPolicy,
        inArray(notification_schedules.notificationId, sourceNotificationIds())
      ),
      // 未開始のScheduleはAudience/Recipient/Deliveryごと削除する。
      orm
        .delete(notification_schedules)
        .where(
          and(
            inArray(
              notification_schedules.notificationId,
              sourceNotificationIds()
            ),
            eq(notification_schedules.sendStatus, 'scheduled'),
            isNull(notification_schedules.startedAt)
          )
        ),
      // Scheduleが残っていないNotificationだけ削除する。
      // completed/failed/stopped の履歴があるNotificationは残る。
      orm.delete(notifications).where(
        and(
          sourceNotificationCondition(),
          notExists(
            orm
              .select({
                notificationScheduleId: notification_schedules.id,
              })
              .from(notification_schedules)
              .where(
                eq(
                  notification_schedules.notificationId,
                  notifications.notificationId
                )
              )
          )
        )
      )
    );
  }

  return [
    ...(options.holdNotificationSyncGatheringIds ?? []).map(gatheringId =>
      orm
        .update(notification_schedules)
        .set({
          failedReason: AUTOMATIC_SYNC_PENDING_REASON,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
          and(
            eq(notification_schedules.sendStatus, 'scheduled'),
            isNull(notification_schedules.startedAt),
            isNull(notification_schedules.scheduledByUserId),
            exists(
              orm
                .select({ notificationId: notifications.notificationId })
                .from(notifications)
                .where(
                  and(
                    eq(
                      notifications.notificationId,
                      notification_schedules.notificationId
                    ),
                    eq(notifications.sourceType, 'gathering'),
                    eq(notifications.sourceId, gatheringId),
                    eq(
                      notifications.createdAt,
                      notification_schedules.createdAt
                    )
                  )
                )
            )
          )
        )
    ),
    ...cleanupStatements,
  ];
}
