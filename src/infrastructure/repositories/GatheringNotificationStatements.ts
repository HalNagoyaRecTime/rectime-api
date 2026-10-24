import { assertGatheringNotificationCleanupPolicy } from '../../domain/entities/gatheringNotificationCleanupPolicy';
import { and, eq, exists, inArray, isNull, notExists, sql } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { EventGatheringChangeSet } from '../../domain/entities/EventGathering';
import type { EventGatheringApplyOptions } from '../../domain/interfaces/repositories/IEventGatheringSettingsRepository';
import { AUTOMATIC_SYNC_PENDING_REASON } from '../../domain/entities/NotificationCreation';
import {
  gatherings,
  notifications,
  notification_schedules,
  notification_recipients,
  notification_push_deliveries,
} from '../database/schema';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type * as schema from '../database/schema';

// 通知の同期保留・削除・停止SQLを構築する。ここではbatchを実行しない。
export function buildGatheringNotificationStatements(
  orm: DrizzleD1Database<typeof schema>,
  changeSet: EventGatheringChangeSet,
  options: EventGatheringApplyOptions
): BatchItem<'sqlite'>[] {
  const notificationCleanup = options.notificationCleanup;
  const cleanupStatements: BatchItem<'sqlite'>[] = [];
  if (notificationCleanup && notificationCleanup.gathering_ids.length > 0) {
    assertGatheringNotificationCleanupPolicy(notificationCleanup);
    const stopPolicy = notificationCleanup.stop_policy;
    const cleanupPolicy = notificationCleanup.cleanup_policy;
    // cleanup対象も event_id で限定する。delete_ids に他EventのIDが混ざっても、
    // そのEventの通知を削除・停止しない。
    const ownedGatheringIds = () =>
      orm
        .select({ gatheringId: gatherings.id })
        .from(gatherings)
        .where(
          and(
            eq(gatherings.eventId, changeSet.event_id),
            inArray(gatherings.id, notificationCleanup.gathering_ids)
          )
        );

    const sourceNotificationIds = () =>
      orm
        .select({ notificationId: notifications.notificationId })
        .from(notifications)
        .where(
          and(
            eq(
              notifications.sourceType,
              cleanupPolicy.notification.source_type
            ),
            inArray(notifications.sourceId, ownedGatheringIds()),
            eq(
              notifications.notificationType,
              cleanupPolicy.notification.notification_type
            )
          )
        );

    const sourceNotificationCondition = () =>
      and(
        eq(notifications.sourceType, cleanupPolicy.notification.source_type),
        inArray(notifications.sourceId, ownedGatheringIds()),
        eq(
          notifications.notificationType,
          cleanupPolicy.notification.notification_type
        )
      );

    cleanupStatements.push(
      // 配信開始済みのScheduleは履歴を残し、source_deletedで停止する。
      orm
        .update(notification_schedules)
        .set({
          sendStatus: cleanupPolicy.schedule.stopped_status,
          stoppedAt: stopPolicy.now,
          stoppedByUserId: stopPolicy.stopped_by_user_id,
          reason: stopPolicy.reason,
          updatedAt: stopPolicy.now,
        })
        .where(
          and(
            inArray(
              notification_schedules.notificationId,
              sourceNotificationIds()
            ),
            inArray(
              notification_schedules.sendStatus,
              stopPolicy.allowed_statuses
            )
          )
        ),
      // 送信待ちのDeliveryだけ止める。sendingはFCM応答保存まで保持する。
      orm
        .update(notification_push_deliveries)
        .set({
          status: cleanupPolicy.delivery.stopped_status,
          nextRetryAt: null,
          updatedAt: stopPolicy.now,
        })
        .where(
          and(
            inArray(
              notification_push_deliveries.status,
              cleanupPolicy.delivery.stop_statuses
            ),
            exists(
              orm
                .select({ recipientId: notification_recipients.id })
                .from(notification_recipients)
                .innerJoin(
                  notification_schedules,
                  eq(
                    notification_schedules.id,
                    notification_recipients.notificationScheduleId
                  )
                )
                .innerJoin(
                  notifications,
                  eq(
                    notifications.notificationId,
                    notification_schedules.notificationId
                  )
                )
                .where(
                  and(
                    eq(
                      notification_recipients.id,
                      notification_push_deliveries.notificationRecipientId
                    ),
                    eq(
                      notification_schedules.sendStatus,
                      cleanupPolicy.schedule.stopped_status
                    ),
                    eq(notification_schedules.reason, stopPolicy.reason),
                    sourceNotificationCondition()
                  )
                )
            )
          )
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
            inArray(
              notification_schedules.sendStatus,
              cleanupPolicy.schedule.delete_statuses
            ),
            cleanupPolicy.schedule.delete_only_unstarted
              ? isNull(notification_schedules.startedAt)
              : undefined
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
