import { and, eq, exists, inArray, isNull, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { NotificationStopPolicy } from '../../domain/entities/NotificationStop';
import {
  notification_push_deliveries,
  notification_recipients,
  notification_schedules,
} from '../database/schema';
import type * as schema from '../database/schema';

// Schedule停止と未送信Delivery停止を同じSQL実装へ集約する。
// 呼び出し元は対象Scheduleの条件だけを渡し、batch実行は各Repository/Transactionが担う。
export function buildNotificationStopStatements(
  orm: DrizzleD1Database<typeof schema>,
  policy: NotificationStopPolicy,
  targetScheduleCondition: SQL
): BatchItem<'sqlite'>[] {
  const stoppedByUserCondition =
    policy.stopped_by_user_id === null
      ? isNull(notification_schedules.stoppedByUserId)
      : eq(notification_schedules.stoppedByUserId, policy.stopped_by_user_id);

  return [
    orm
      .update(notification_schedules)
      .set({
        sendStatus: 'stopped',
        stoppedAt: policy.now,
        stoppedByUserId: policy.stopped_by_user_id,
        reason: policy.reason,
        updatedAt: policy.now,
      })
      .where(
        and(
          targetScheduleCondition,
          inArray(notification_schedules.sendStatus, policy.allowed_statuses)
        )
      ),
    // sendingはFCM応答保存まで維持し、未送信・Retry待ちだけ停止する。
    orm
      .update(notification_push_deliveries)
      .set({
        status: 'stopped',
        nextRetryAt: null,
        updatedAt: policy.now,
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
              .where(
                and(
                  eq(
                    notification_recipients.id,
                    notification_push_deliveries.notificationRecipientId
                  ),
                  targetScheduleCondition,
                  eq(notification_schedules.sendStatus, 'stopped'),
                  eq(notification_schedules.stoppedAt, policy.now),
                  stoppedByUserCondition,
                  eq(notification_schedules.reason, policy.reason)
                )
              )
          )
        )
      ),
  ];
}
