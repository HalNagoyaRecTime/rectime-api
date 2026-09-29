import type {
  AdminNotificationDetailDTO,
  AdminNotificationListItemDTO,
  NotificationCreationDTO,
  NotificationDateRangeQueryDTO,
  NotificationUserReferenceDTO,
} from '../dto/AdminNotificationDTO';
import type {
  AdminNotificationSnapshot,
  NotificationScheduleSnapshot,
  NotificationUserSnapshot,
} from '../../domain/entities/AdminNotificationQuery';
import type { IAdminNotificationQueryRepository } from '../../domain/interfaces/repositories/IAdminNotificationQueryRepository';
import type { IAdminNotificationQueryService } from './IAdminNotificationQueryService';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

export function createAdminNotificationQueryService(
  repository: IAdminNotificationQueryRepository,
  now: () => Date = () => new Date()
): IAdminNotificationQueryService {
  const getAdminNotificationById = async (
    notificationId: number
  ): Promise<AdminNotificationDetailDTO | null> => {
    const snapshot = await repository.findById(notificationId);
    return snapshot ? toDetailDTO(snapshot) : null;
  };

  return {
    async getAdminNotifications(query) {
      const dateRange =
        query.from !== undefined && query.to !== undefined
          ? { from: query.from, to: query.to }
          : getDefaultDateRange(now());
      const snapshots = await repository.findAll(dateRange);
      return { items: snapshots.map(toListItemDTO) };
    },
    getAdminNotificationById,
    // CommandのPATCH Responseが利用する既存の詳細取得契約を同じ実装へ接続する。
    getNotificationDetail: getAdminNotificationById,
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

function toListItemDTO(
  snapshot: AdminNotificationSnapshot
): AdminNotificationListItemDTO {
  return {
    notificationId: snapshot.notification_id,
    content: {
      push: { title: snapshot.push_title, body: snapshot.push_body },
    },
    importance: snapshot.importance,
    creation: toCreationDTO(snapshot),
    createdAt: snapshot.created_at,
    schedules: snapshot.schedules.map(toScheduleListItemDTO),
  };
}

function toDetailDTO(
  snapshot: AdminNotificationSnapshot
): AdminNotificationDetailDTO {
  return {
    notificationId: snapshot.notification_id,
    content: {
      push: { title: snapshot.push_title, body: snapshot.push_body },
      detail: { title: snapshot.detail_title, body: snapshot.detail_body },
    },
    importance: snapshot.importance,
    creation: toCreationDTO(snapshot),
    createdAt: snapshot.created_at,
    updatedAt: snapshot.updated_at,
    schedules: snapshot.schedules.map(schedule => ({
      ...toScheduleListItemDTO(schedule),
      stop: toStopDTO(schedule),
    })),
  };
}

function toCreationDTO(
  snapshot: AdminNotificationSnapshot
): NotificationCreationDTO {
  if (snapshot.source_type === null) {
    return {
      method: 'manual',
      user: toUserReference(snapshot.created_by),
      source: null,
    };
  }

  if (snapshot.source_id === null) {
    throw new Error('自動通知のSource IDがありません');
  }

  return {
    method: 'automatic',
    user: null,
    source: {
      type: snapshot.source_type,
      id: snapshot.source_id,
      label: snapshot.source_label,
    },
  };
}

function toScheduleListItemDTO(schedule: NotificationScheduleSnapshot) {
  return {
    notificationScheduleId: schedule.notification_schedule_id,
    sendAt: schedule.send_at,
    status: schedule.status,
    scheduledBy: toUserReference(schedule.scheduled_by),
    createdAt: schedule.created_at,
    audience: {
      items: schedule.audiences.map(audience => {
        if (audience.type === 'all') return { type: 'all' as const };
        if (audience.target_id === null) {
          throw new Error('通知Audienceの対象IDがありません');
        }
        return {
          type: audience.type,
          targetId: audience.target_id,
          label: audience.label,
        };
      }),
      recipientResolution: {
        status:
          schedule.recipients_resolved_at === null
            ? ('pending' as const)
            : ('resolved' as const),
        resolvedCount: schedule.recipient_count,
      },
    },
    recipientPushSummary: {
      totalCount: schedule.recipient_count,
      successCount: schedule.success_count,
      failedCount: schedule.failed_count,
      noPushTargetCount: schedule.no_push_target_count,
    },
  };
}

function toStopDTO(schedule: NotificationScheduleSnapshot) {
  if (
    schedule.status !== 'stopped' ||
    schedule.stopped_at === null ||
    schedule.stop_reason === null
  ) {
    return null;
  }

  return {
    reason: schedule.stop_reason,
    stoppedAt: schedule.stopped_at,
    stoppedBy: toUserReference(schedule.stopped_by),
  };
}

function toUserReference(
  user: NotificationUserSnapshot | null
): NotificationUserReferenceDTO | null {
  return user ? { userId: user.user_id, userName: user.user_name } : null;
}
