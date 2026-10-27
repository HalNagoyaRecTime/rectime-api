import type { D1Database } from '@cloudflare/workers-types';
import { and, eq, exists } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { INotificationStopRepository } from '../../domain/interfaces/repositories/INotificationStopRepository';
import * as schema from '../database/schema';
import { notifications, notification_schedules } from '../database/schema';
import { buildNotificationStopStatements } from './NotificationStopStatements';

export function createNotificationStopRepository(
  db: D1Database
): INotificationStopRepository {
  const orm = drizzle(db, { schema });

  return {
    async stopSchedule(input) {
      const targetScheduleCondition = and(
        eq(notification_schedules.id, input.schedule_id),
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
                eq(notifications.notificationType, 'notification_general')
              )
            )
        )
      );
      if (!targetScheduleCondition)
        throw new Error('通知停止対象の条件を構築できませんでした');

      const [scheduleStop, deliveryStop] = buildNotificationStopStatements(
        orm,
        input,
        targetScheduleCondition
      );
      const results = await orm.batch([scheduleStop, deliveryStop]);
      if (results[0].meta.changes === 1) return 'stopped';

      const schedule = await db
        .prepare(
          `SELECT s.notification_schedule_id FROM notification_schedules s
        JOIN notifications n USING (notification_id) WHERE s.notification_schedule_id = ? AND n.notification_type = 'notification_general'`
        )
        .bind(input.schedule_id)
        .first();
      return schedule ? 'not_allowed' : 'not_found';
    },
  };
}
