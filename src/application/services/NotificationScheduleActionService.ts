import type { INotificationScheduleActionRepository } from '../../domain/interfaces/repositories/INotificationScheduleActionRepository';
import type { INotificationScheduleActionService } from './INotificationScheduleActionService';

export class NotificationScheduleActionError extends Error {
  constructor(
    readonly code:
      | 'NOTIFICATION_SCHEDULE_NOT_FOUND'
      | 'NOTIFICATION_RESEND_NOT_ALLOWED'
      | 'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED'
  ) {
    super(code);
    this.name = 'NotificationScheduleActionError';
  }
}

export function createNotificationScheduleActionService(
  repository: INotificationScheduleActionRepository
): INotificationScheduleActionService {
  return {
    async resendSchedule(scheduleId, actorUserId, request, now = new Date()) {
      const snapshot = await repository.findActionSnapshot(scheduleId);
      if (!snapshot)
        throw new NotificationScheduleActionError(
          'NOTIFICATION_SCHEDULE_NOT_FOUND'
        );
      if (snapshot.source_type === 'gathering' && !snapshot.source_exists)
        throw new NotificationScheduleActionError(
          'NOTIFICATION_RESEND_NOT_ALLOWED'
        );
      const result = await repository.createResend({
        schedule_id: scheduleId,
        actor_user_id: actorUserId,
        send_at:
          request.delivery.type === 'immediate'
            ? now.toISOString()
            : new Date(request.delivery.sendAt).toISOString(),
        now: now.toISOString(),
      });
      if (result.status === 'not_found')
        throw new NotificationScheduleActionError(
          'NOTIFICATION_SCHEDULE_NOT_FOUND'
        );
      if (result.status === 'not_allowed')
        throw new NotificationScheduleActionError(
          'NOTIFICATION_RESEND_NOT_ALLOWED'
        );
      if (result.status !== 'created') throw new Error('再送結果が不正です');
      return {
        notificationId: result.notification_id,
        notificationScheduleId: result.notification_schedule_id,
      };
    },
    async cancelSchedule(scheduleId) {
      const snapshot = await repository.findActionSnapshot(scheduleId);
      if (!snapshot)
        throw new NotificationScheduleActionError(
          'NOTIFICATION_SCHEDULE_NOT_FOUND'
        );
      if (
        snapshot.started_at !== null ||
        snapshot.send_status !== 'scheduled' ||
        snapshot.recipients_resolved_at !== null ||
        snapshot.has_recipients
      )
        throw new NotificationScheduleActionError(
          'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED'
        );
      const result = await repository.cancelUnstarted(scheduleId);
      if (result === 'not_found')
        throw new NotificationScheduleActionError(
          'NOTIFICATION_SCHEDULE_NOT_FOUND'
        );
      if (result === 'not_allowed')
        throw new NotificationScheduleActionError(
          'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED'
        );
    },
  };
}
