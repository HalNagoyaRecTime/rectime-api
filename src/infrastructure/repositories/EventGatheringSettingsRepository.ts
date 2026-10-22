import type { D1Database } from '@cloudflare/workers-types';
import {
  and,
  asc,
  count,
  eq,
  exists,
  inArray,
  isNull,
  notExists,
  sql,
} from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import { drizzle } from 'drizzle-orm/d1';
import type {
  EventGatheringChangeSet,
  EventGatheringEntity,
} from '../../domain/entities/EventGathering';
import type {
  EventGatheringApplyOptions,
  IEventGatheringSettingsRepository,
} from '../../domain/interfaces/repositories/IEventGatheringSettingsRepository';
import * as schema from '../database/schema';
import { AUTOMATIC_SYNC_PENDING_REASON } from '../../domain/entities/NotificationCreation';
import {
  gathering_group_members,
  gathering_spots,
  gatherings,
  notification_push_deliveries,
  notification_recipients,
  notification_schedules,
  notifications,
} from '../database/schema';

export function createEventGatheringSettingsRepository(
  db: D1Database
): IEventGatheringSettingsRepository {
  const orm = drizzle(db, { schema });

  return {
    async findByEventId(eventId: number): Promise<EventGatheringEntity[]> {
      // 参加人数は集合予定ごとに個別に数えず、LEFT JOIN + GROUP BY で
      // 1回のクエリに収める。参加者がいない集合予定は0件として残る。
      return orm
        .select({
          gathering_id: gatherings.id,
          round: gatherings.round,
          gathering_time: gatherings.gatheringTime,
          round_start_time: gatherings.roundStartTime,
          gathering_spot_id: gathering_spots.id,
          gathering_spot_name: gathering_spots.name,
          gathering_spot_image_key: gathering_spots.imageKey,
          member_count: count(gathering_group_members.id),
        })
        .from(gatherings)
        .innerJoin(
          gathering_spots,
          eq(gatherings.gatheringSpotId, gathering_spots.id)
        )
        .leftJoin(
          gathering_group_members,
          eq(gathering_group_members.gatheringId, gatherings.id)
        )
        .where(eq(gatherings.eventId, eventId))
        .groupBy(gatherings.id, gathering_spots.id)
        .orderBy(asc(gatherings.round), asc(gatherings.id))
        .all();
    },

    async apply(
      changeSet: EventGatheringChangeSet,
      options: EventGatheringApplyOptions = {}
    ): Promise<void> {
      // 更新・削除は event_id も条件に含める。Application Service が対象Eventの
      // 集合予定だけを差分に入れる前提だが、他Eventの行を書き換える経路を
      // DB側でも塞いでおく。
      const ownedBy = (gatheringId: number) =>
        and(
          eq(gatherings.id, gatheringId),
          eq(gatherings.eventId, changeSet.event_id)
        );

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
          // 配信開始済みのScheduleは履歴を残し、source_deletedで停止する。
          orm
            .update(notification_schedules)
            .set({
              sendStatus: 'stopped',
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
              status: 'stopped',
              nextRetryAt: null,
              updatedAt: stopPolicy.now,
            })
            .where(
              and(
                inArray(notification_push_deliveries.status, [
                  'pending',
                  'retry_wait',
                ]),
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
                        eq(notification_schedules.sendStatus, 'stopped'),
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

      // 参加者(gathering_group_members)は消さない。参加者が残っている集合予定の
      // DELETE は外部キー制約で失敗し、batch 全体が取り消される。
      const statements: BatchItem<'sqlite'>[] = [
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
        ...changeSet.delete_ids.map(gatheringId =>
          orm.delete(gatherings).where(ownedBy(gatheringId))
        ),
        ...changeSet.updates.map(update =>
          orm
            .update(gatherings)
            .set({
              round: update.round,
              roundStartTime: update.round_start_time,
              gatheringTime: update.gathering_time,
              gatheringSpotId: update.gathering_spot_id,
              updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(ownedBy(update.gathering_id))
        ),
        ...changeSet.creates.map(create =>
          orm.insert(gatherings).values({
            eventId: changeSet.event_id,
            round: create.round,
            roundStartTime: create.round_start_time,
            gatheringTime: create.gathering_time,
            gatheringSpotId: create.gathering_spot_id,
          })
        ),
      ];

      const [first, ...rest] = statements;
      if (!first) return;
      await orm.batch([first, ...rest]);
    },
  };
}
