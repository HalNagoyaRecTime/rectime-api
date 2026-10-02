import type {
  AdminNotificationDetailDTO,
  AdminNotificationListItemDTO,
  NotificationAudienceDTO,
  NotificationCreationDTO,
  NotificationDateRangeQueryDTO,
  NotificationUserReferenceDTO,
} from '../dto/AdminNotificationDTO';
import type {
  AdminNotificationQueryAudienceItem,
  AdminNotificationQueryCreation,
  AdminNotificationQueryResult,
  AdminNotificationQuerySchedule,
  AdminNotificationQueryUserReference,
} from '../../domain/entities/AdminNotificationQuery';
import type { IAdminNotificationQueryRepository } from '../../domain/interfaces/repositories/IAdminNotificationQueryRepository';
import type { IAdminNotificationQueryService } from './IAdminNotificationQueryService';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function createAdminNotificationQueryService(
  repository: IAdminNotificationQueryRepository,
  now: () => Date = () => new Date()
): IAdminNotificationQueryService {
  return {
    async getAdminNotifications(query) {
      const dateRange =
        query.from && query.to
          ? { from: query.from, to: query.to }
          : getDefaultDateRange(now());
      const notifications = await repository.findAll(dateRange);
      return { items: notifications.map(toListItem) };
    },

    async getAdminNotificationById(notificationId) {
      const notification = await repository.findById(notificationId);
      return notification ? toDetail(notification) : null;
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
  notification: AdminNotificationQueryResult
): AdminNotificationListItemDTO {
  return {
    notificationId: notification.notification_id,
    content: {
      push: {
        title: notification.push_title,
        body: notification.push_body,
      },
    },
    importance: notification.importance,
    creation: toCreation(notification.creation),
    createdAt: notification.created_at,
    schedules: notification.schedules.map(toScheduleListItem),
  };
}

function toDetail(
  notification: AdminNotificationQueryResult
): AdminNotificationDetailDTO {
  return {
    notificationId: notification.notification_id,
    content: {
      push: {
        title: notification.push_title,
        body: notification.push_body,
      },
      detail: {
        title: notification.detail_title,
        body: notification.detail_body,
      },
    },
    importance: notification.importance,
    creation: toCreation(notification.creation),
    createdAt: notification.created_at,
    updatedAt: notification.updated_at,
    schedules: notification.schedules.map(toScheduleSummary),
  };
}

function toCreation(
  creation: AdminNotificationQueryCreation
): NotificationCreationDTO {
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

function toAudienceItem(
  item: AdminNotificationQueryAudienceItem
): NotificationAudienceDTO['items'][number] {
  return item.type === 'all'
    ? { type: 'all' }
    : { type: item.type, targetId: item.target_id, label: item.label };
}

function toAudience(schedule: AdminNotificationQuerySchedule) {
  return {
    items: schedule.audience.items.map(toAudienceItem),
    recipientResolution: {
      status: schedule.audience.recipient_resolution.status,
      resolvedCount: schedule.audience.recipient_resolution.resolved_count,
    },
  };
}

function toScheduleListItem(schedule: AdminNotificationQuerySchedule) {
  return {
    notificationScheduleId: schedule.notification_schedule_id,
    sendAt: schedule.send_at,
    status: schedule.status,
    scheduledBy: toUserReference(schedule.scheduled_by),
    createdAt: schedule.created_at,
    audience: toAudience(schedule),
    recipientPushSummary: toRecipientPushSummary(schedule),
  };
}

function toScheduleSummary(schedule: AdminNotificationQuerySchedule) {
  return {
    ...toScheduleListItem(schedule),
    stop: schedule.stop
      ? {
          reason: schedule.stop.reason,
          stoppedAt: schedule.stop.stopped_at,
          stoppedBy: toUserReference(schedule.stop.stopped_by),
        }
      : null,
  };
}

function toRecipientPushSummary(schedule: AdminNotificationQuerySchedule) {
  return {
    totalCount: schedule.recipient_push_summary.total_count,
    successCount: schedule.recipient_push_summary.success_count,
    failedCount: schedule.recipient_push_summary.failed_count,
    noPushTargetCount: schedule.recipient_push_summary.no_push_target_count,
  };
}

function toUserReference(
  user: AdminNotificationQueryUserReference | null
): NotificationUserReferenceDTO | null {
  return user ? { userId: user.user_id, userName: user.user_name } : null;
}
