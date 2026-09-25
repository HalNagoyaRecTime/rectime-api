import type {
  AdminNotificationDetailDTO,
  NotificationCreateRequestDTO,
  NotificationCreateResponseDTO,
  NotificationPatchRequestDTO,
} from '../dto/AdminNotificationDTO';
import type {
  AdminNotificationSnapshot,
  CreateNotificationCommand,
  NotificationAudienceTarget,
  UpdateNotificationCommand,
} from '../../domain/entities/AdminNotificationCommand';
import type { IAdminNotificationCommandRepository } from '../../domain/interfaces/repositories/IAdminNotificationCommandRepository';

export type AdminNotificationCommandErrorCode =
  | 'NOTIFICATION_IMPORTANCE_FORBIDDEN'
  | 'NOTIFICATION_AUDIENCE_NOT_FOUND'
  | 'ADMIN_NOTIFICATION_NOT_FOUND'
  | 'NOTIFICATION_SCHEDULE_NOT_FOUND'
  | 'NOTIFICATION_EDIT_NOT_ALLOWED'
  | 'NOTIFICATION_DELETE_NOT_ALLOWED';

export class AdminNotificationCommandError extends Error {
  constructor(readonly code: AdminNotificationCommandErrorCode) {
    super(code);
    this.name = 'AdminNotificationCommandError';
  }
}

export function createAdminNotificationCommandService(
  repository: IAdminNotificationCommandRepository
) {
  const createNotification = async (
    actorUserId: number,
    request: NotificationCreateRequestDTO
  ): Promise<NotificationCreateResponseDTO> => {
    assertImportanceAllowed(request.importance);
    const audiences = toAudienceTargets(request.audience.items);
    if (!(await repository.areAudienceTargetsAvailable(audiences))) {
      throw new AdminNotificationCommandError(
        'NOTIFICATION_AUDIENCE_NOT_FOUND'
      );
    }

    const now = new Date().toISOString();
    const command: CreateNotificationCommand = {
      actor_user_id: actorUserId,
      push_title: request.content.push.title,
      push_body: request.content.push.body,
      detail_title: request.content.detail.title,
      detail_body: request.content.detail.body,
      importance: request.importance,
      send_at: resolveSendAt(request.delivery, now),
      audiences,
      now,
    };
    const created = await repository.create(command);
    return {
      notificationId: created.notification_id,
      notificationScheduleId: created.notification_schedule_id,
    };
  };

  const patchNotification = async (
    notificationId: number,
    request: NotificationPatchRequestDTO
  ): Promise<AdminNotificationDetailDTO> => {
    const snapshot = await repository.findMutationSnapshot(notificationId);
    if (!snapshot) {
      throw new AdminNotificationCommandError('ADMIN_NOTIFICATION_NOT_FOUND');
    }

    if (
      request.importance !== undefined &&
      !isImportanceAllowed(request.importance)
    ) {
      throw new AdminNotificationCommandError(
        'NOTIFICATION_IMPORTANCE_FORBIDDEN'
      );
    }

    const requiresUnstartedSchedules =
      request.content?.push !== undefined ||
      request.importance !== undefined ||
      request.schedule !== undefined;
    if (
      requiresUnstartedSchedules &&
      snapshot.schedules.some(schedule => schedule.started_at !== null)
    ) {
      throw new AdminNotificationCommandError('NOTIFICATION_EDIT_NOT_ALLOWED');
    }

    let schedule: UpdateNotificationCommand['schedule'];
    if (request.schedule) {
      const scheduleId = request.schedule.notificationScheduleId;
      if (
        !snapshot.schedules.some(
          candidate => candidate.notification_schedule_id === scheduleId
        )
      ) {
        throw new AdminNotificationCommandError(
          'NOTIFICATION_SCHEDULE_NOT_FOUND'
        );
      }

      const audiences = request.schedule.audience
        ? toAudienceTargets(request.schedule.audience.items)
        : undefined;
      if (
        audiences &&
        !(await repository.areAudienceTargetsAvailable(audiences))
      ) {
        throw new AdminNotificationCommandError(
          'NOTIFICATION_AUDIENCE_NOT_FOUND'
        );
      }

      const now = new Date().toISOString();
      schedule = {
        notification_schedule_id: scheduleId,
        ...(request.schedule.delivery
          ? {
              send_at: resolveSendAt(request.schedule.delivery, now),
            }
          : {}),
        ...(audiences ? { audiences } : {}),
      };
    }

    const now = new Date().toISOString();
    const command: UpdateNotificationCommand = {
      notification_id: notificationId,
      updated_at: now,
      ...(request.content?.push?.title !== undefined
        ? { push_title: request.content.push.title }
        : {}),
      ...(request.content?.push?.body !== undefined
        ? { push_body: request.content.push.body }
        : {}),
      ...(request.content?.detail?.title !== undefined
        ? { detail_title: request.content.detail.title }
        : {}),
      ...(request.content?.detail?.body !== undefined
        ? { detail_body: request.content.detail.body }
        : {}),
      ...(request.importance !== undefined
        ? { importance: request.importance }
        : {}),
      ...(schedule ? { schedule } : {}),
      requires_unstarted_schedules: requiresUnstartedSchedules,
    };
    const result = await repository.update(command);
    if (result === 'not_found') {
      throw new AdminNotificationCommandError('ADMIN_NOTIFICATION_NOT_FOUND');
    }
    if (result === 'schedule_not_found') {
      throw new AdminNotificationCommandError(
        'NOTIFICATION_SCHEDULE_NOT_FOUND'
      );
    }
    if (result === 'not_allowed') {
      throw new AdminNotificationCommandError('NOTIFICATION_EDIT_NOT_ALLOWED');
    }

    const updated = await repository.findDetail(notificationId);
    if (!updated) {
      throw new AdminNotificationCommandError('ADMIN_NOTIFICATION_NOT_FOUND');
    }
    return toDetailDTO(updated);
  };

  const deleteNotification = async (notificationId: number): Promise<void> => {
    const snapshot = await repository.findMutationSnapshot(notificationId);
    if (!snapshot) {
      throw new AdminNotificationCommandError('ADMIN_NOTIFICATION_NOT_FOUND');
    }
    if (
      snapshot.source_type !== null ||
      snapshot.schedules.some(schedule => schedule.started_at !== null)
    ) {
      throw new AdminNotificationCommandError(
        'NOTIFICATION_DELETE_NOT_ALLOWED'
      );
    }

    const result = await repository.deleteUnstartedManual(notificationId);
    if (result === 'not_found') {
      throw new AdminNotificationCommandError('ADMIN_NOTIFICATION_NOT_FOUND');
    }
    if (result === 'not_allowed') {
      throw new AdminNotificationCommandError(
        'NOTIFICATION_DELETE_NOT_ALLOWED'
      );
    }
  };

  return {
    createNotification,
    patchNotification,
    deleteNotification,
  };
}

function assertImportanceAllowed(
  importance: NotificationCreateRequestDTO['importance']
): void {
  if (!isImportanceAllowed(importance)) {
    throw new AdminNotificationCommandError(
      'NOTIFICATION_IMPORTANCE_FORBIDDEN'
    );
  }
}

function isImportanceAllowed(
  importance: NotificationCreateRequestDTO['importance']
): boolean {
  // highを許可する上位権限は現在のUser契約に存在しない。
  return importance !== 'high';
}

function toAudienceTargets(
  items: NotificationCreateRequestDTO['audience']['items']
): NotificationAudienceTarget[] {
  const targets = items.map(item =>
    item.type === 'all'
      ? { type: 'all' as const, target_id: null }
      : { type: item.type, target_id: item.targetId }
  );
  const unique = new Map<string, NotificationAudienceTarget>();
  for (const target of targets) {
    unique.set(target.type + ':' + String(target.target_id), target);
  }
  return Array.from(unique.values());
}

function resolveSendAt(
  delivery: NotificationCreateRequestDTO['delivery'],
  now: string
): string {
  return delivery.type === 'immediate'
    ? now
    : new Date(delivery.sendAt).toISOString();
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
