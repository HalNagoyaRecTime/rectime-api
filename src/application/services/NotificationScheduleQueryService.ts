import type { NotificationDateRangeQueryDTO } from '../dto/AdminNotificationDTO';
import type {
  NotificationScheduleDetailDTO,
  NotificationScheduleListItemDTO,
} from '../dto/NotificationScheduleDTO';
import type {
  NotificationScheduleQueryCreation,
  NotificationScheduleQueryDetail,
  NotificationScheduleQueryListItem,
} from '../../domain/entities/NotificationScheduleQuery';
import type { INotificationScheduleQueryRepository } from '../../domain/interfaces/repositories/INotificationScheduleQueryRepository';
import type { INotificationScheduleQueryService } from './INotificationScheduleQueryService';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function createNotificationScheduleQueryService(
  repository: INotificationScheduleQueryRepository,
  now: () => Date = () => new Date()
): INotificationScheduleQueryService {
  return {
    async getNotificationSchedules(query) {
      const range =
        query.from && query.to
          ? { from: query.from, to: query.to }
          : getDefaultDateRange(now());
      const schedules = await repository.findAll(range);
      return { items: schedules.map(toListItem) };
    },

    async getNotificationScheduleById(notificationScheduleId) {
      const schedule = await repository.findById(notificationScheduleId);
      return schedule ? toDetail(schedule) : null;
    },
  };
}

function getDefaultDateRange(
  now: Date
): Required<NotificationDateRangeQueryDTO> {
  const date = new Date(now.getTime() + JST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  return {
    from: `${date}T00:00:00.000+09:00`,
    to: `${date}T23:59:59.999+09:00`,
  };
}

function toListItem(
  schedule: NotificationScheduleQueryListItem
): NotificationScheduleListItemDTO {
  return {
    notificationId: schedule.notification_id,
    notificationScheduleId: schedule.notification_schedule_id,
    content: {
      push: { title: schedule.push_title, body: schedule.push_body },
    },
    importance: schedule.importance,
    sendAt: schedule.send_at,
    status: schedule.status,
    stop: schedule.stop
      ? {
          reason: schedule.stop.reason,
          stoppedAt: schedule.stop.stopped_at,
          stoppedBy: toUserReference(schedule.stop.stopped_by),
        }
      : null,
    creation: toCreation(schedule.creation),
  };
}

function toDetail(
  schedule: NotificationScheduleQueryDetail
): NotificationScheduleDetailDTO {
  return {
    ...toListItem(schedule),
    audienceProgress: {
      totalCount: schedule.audience_progress.total_count,
      resolvedCount: schedule.audience_progress.resolved_count,
    },
    recipientProgress: {
      count: schedule.recipient_progress.count,
      status: schedule.recipient_progress.status,
    },
    deliveryProgress: {
      totalCount: schedule.delivery_progress.total_count,
      pendingCount: schedule.delivery_progress.pending_count,
      sendingCount: schedule.delivery_progress.sending_count,
      retryWaitCount: schedule.delivery_progress.retry_wait_count,
      sentCount: schedule.delivery_progress.sent_count,
      failedCount: schedule.delivery_progress.failed_count,
      stoppedCount: schedule.delivery_progress.stopped_count,
    },
  };
}

function toCreation(
  creation: NotificationScheduleQueryCreation
): NotificationScheduleListItemDTO['creation'] {
  return creation.method === 'manual'
    ? {
        method: 'manual',
        user: toUserReference(creation.user),
        source: null,
      }
    : {
        method: 'automatic',
        user: null,
        source: {
          type: creation.source.type,
          id: creation.source.id,
          label: creation.source.label,
        },
      };
}

function toUserReference(user: NotificationScheduleQueryCreation['user']) {
  return user ? { userId: user.user_id, userName: user.user_name } : null;
}
