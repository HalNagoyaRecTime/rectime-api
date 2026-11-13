import type {
  NotificationScheduleBaseDTO,
  NotificationScheduleDetailDTO,
  NotificationScheduleListItemDTO,
} from '../dto/NotificationScheduleDTO';
import type {
  NotificationScheduleQueryBase,
  NotificationScheduleQueryCreation,
  NotificationScheduleQueryDetail,
  NotificationScheduleQueryListItem,
  NotificationScheduleQueryProgress,
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

function getDefaultDateRange(now: Date): { from: string; to: string } {
  const date = new Date(now.getTime() + JST_OFFSET_MS)
    .toISOString()
    .slice(0, 10);
  return {
    from: `${date}T00:00:00.000+09:00`,
    to: `${date}T23:59:59.999+09:00`,
  };
}

function toBase(
  schedule: NotificationScheduleQueryBase
): NotificationScheduleBaseDTO {
  return {
    notificationId: schedule.notification_id,
    notificationScheduleId: schedule.notification_schedule_id,
    content: {
      push: { title: schedule.push_title, body: schedule.push_body },
    },
    importance: schedule.importance,
    sendAt: schedule.send_at,
    status: schedule.status,
    failureReason:
      schedule.status === 'failed' ? schedule.failure_reason : null,
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

function toListItem(
  schedule: NotificationScheduleQueryListItem
): NotificationScheduleListItemDTO {
  return {
    ...toBase(schedule),
    audienceProgress:
      schedule.audience_progress &&
      toAudienceProgress(schedule.audience_progress),
    recipientProgress:
      schedule.recipient_progress &&
      toRecipientProgress(schedule.recipient_progress),
    deliveryProgress:
      schedule.delivery_progress &&
      toDeliveryProgress(schedule.delivery_progress),
  };
}

function toDetail(
  schedule: NotificationScheduleQueryDetail
): NotificationScheduleDetailDTO {
  return {
    ...toBase(schedule),
    audienceProgress: toAudienceProgress(schedule.audience_progress),
    recipientProgress: toRecipientProgress(schedule.recipient_progress),
    deliveryProgress: toDeliveryProgress(schedule.delivery_progress),
  };
}

function toAudienceProgress(
  progress: NotificationScheduleQueryProgress['audience_progress']
): NotificationScheduleDetailDTO['audienceProgress'] {
  return {
    totalCount: progress.total_count,
    resolvedCount: progress.resolved_count,
  };
}

function toRecipientProgress(
  progress: NotificationScheduleQueryProgress['recipient_progress']
): NotificationScheduleDetailDTO['recipientProgress'] {
  return { count: progress.count, status: progress.status };
}

function toDeliveryProgress(
  progress: NotificationScheduleQueryProgress['delivery_progress']
): NotificationScheduleDetailDTO['deliveryProgress'] {
  return {
    totalCount: progress.total_count,
    pendingCount: progress.pending_count,
    sendingCount: progress.sending_count,
    retryWaitCount: progress.retry_wait_count,
    sentCount: progress.sent_count,
    failedCount: progress.failed_count,
    stoppedCount: progress.stopped_count,
  };
}

function toCreation(
  creation: NotificationScheduleQueryCreation
): NotificationScheduleBaseDTO['creation'] {
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
