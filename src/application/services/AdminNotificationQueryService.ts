import type { AdminNotificationDetailDTO } from '../dto/AdminNotificationDTO';
import type { AdminNotificationSnapshot } from '../../domain/entities/AdminNotificationQuery';
import type { IAdminNotificationQueryRepository } from '../../domain/interfaces/repositories/IAdminNotificationQueryRepository';
import type { IAdminNotificationQueryService } from './IAdminNotificationQueryService';

export function createAdminNotificationQueryService(
  repository: IAdminNotificationQueryRepository
): IAdminNotificationQueryService {
  return {
    async getNotificationDetail(notificationId) {
      const snapshot = await repository.findDetail(notificationId);
      return snapshot ? toDetailDTO(snapshot) : null;
    },
  };
}

function toDetailDTO(
  snapshot: AdminNotificationSnapshot
): AdminNotificationDetailDTO {
  if (snapshot.source_type !== null && snapshot.source_id === null) {
    throw new Error('自動通知のSource IDがありません');
  }
  const creation: AdminNotificationDetailDTO['creation'] =
    snapshot.source_type === null
      ? {
          method: 'manual',
          user: snapshot.created_by
            ? {
                userId: snapshot.created_by.user_id,
                userName: snapshot.created_by.user_name,
              }
            : null,
          source: null,
        }
      : {
          method: 'automatic',
          user: null,
          source: {
            type: snapshot.source_type,
            id: snapshot.source_id!,
            label: snapshot.source_label,
          },
        };

  return {
    notificationId: snapshot.notification_id,
    content: {
      push: { title: snapshot.push_title, body: snapshot.push_body },
      detail: { title: snapshot.detail_title, body: snapshot.detail_body },
    },
    importance: snapshot.importance,
    creation,
    createdAt: snapshot.created_at,
    updatedAt: snapshot.updated_at,
    schedules: snapshot.schedules.map(schedule => ({
      notificationScheduleId: schedule.notification_schedule_id,
      sendAt: schedule.send_at,
      status: schedule.status,
      stop:
        schedule.stopped_at !== null && schedule.stop_reason !== null
          ? {
              reason: schedule.stop_reason,
              stoppedAt: schedule.stopped_at,
              stoppedBy: schedule.stopped_by
                ? {
                    userId: schedule.stopped_by.user_id,
                    userName: schedule.stopped_by.user_name,
                  }
                : null,
            }
          : null,
      scheduledBy: schedule.scheduled_by
        ? {
            userId: schedule.scheduled_by.user_id,
            userName: schedule.scheduled_by.user_name,
          }
        : null,
      createdAt: schedule.created_at,
      audience: {
        items: schedule.audiences.map(audience =>
          audience.type === 'all'
            ? { type: 'all' as const }
            : {
                type: audience.type,
                targetId: audience.target_id ?? 0,
                label: audience.label,
              }
        ),
        recipientResolution: {
          status: schedule.recipients_resolved_at ? 'resolved' : 'pending',
          resolvedCount: schedule.recipient_count,
        },
      },
      recipientPushSummary: {
        totalCount: schedule.recipient_count,
        successCount: schedule.success_count,
        failedCount: schedule.failed_count,
        noPushTargetCount: schedule.no_push_target_count,
      },
    })),
  };
}
