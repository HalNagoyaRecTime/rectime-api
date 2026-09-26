import {
  NOTIFICATION_AUDIENCE_RESOLVER_SCHEDULE_LIMIT,
  UnresolvableNotificationAudienceError,
  type NotificationAudienceResolverResult,
} from '../../domain/entities/NotificationAudienceResolver';
import type { INotificationAudienceResolverRepository } from '../../domain/interfaces/repositories/INotificationAudienceResolverRepository';

export function createNotificationAudienceResolverService(
  repository: INotificationAudienceResolverRepository
) {
  return {
    async resolveDueSchedules(
      now = new Date()
    ): Promise<NotificationAudienceResolverResult> {
      const timestamp = now.toISOString();
      const candidates = await repository.findDueCandidates(
        timestamp,
        NOTIFICATION_AUDIENCE_RESOLVER_SCHEDULE_LIMIT
      );
      const result: NotificationAudienceResolverResult = {
        completed_schedules: [],
        retryable_schedule_ids: [],
        failed_schedule_ids: [],
      };

      for (const candidate of candidates) {
        const scheduleId = candidate.notification_schedule_id;
        try {
          if (
            candidate.send_status === 'scheduled' &&
            !(await repository.claimScheduled(scheduleId, timestamp))
          ) {
            continue;
          }

          const audiences =
            await repository.findUnresolvedAudiences(scheduleId);
          for (const audience of audiences) {
            await repository.resolveAudience(scheduleId, audience, timestamp);
          }

          const recipientCount = await repository.countRecipients(scheduleId);
          if (
            await repository.completeScheduleIfResolved(scheduleId, timestamp)
          ) {
            result.completed_schedules.push({
              notification_schedule_id: scheduleId,
              recipient_count: recipientCount,
            });
          }
        } catch (error) {
          if (error instanceof UnresolvableNotificationAudienceError) {
            try {
              if (
                await repository.failSchedule(
                  scheduleId,
                  error.message,
                  timestamp
                )
              ) {
                result.failed_schedule_ids.push(scheduleId);
                continue;
              }
            } catch {
              // DB更新に失敗した場合は次回Cronで再試行する。
              result.retryable_schedule_ids.push(scheduleId);
              continue;
            }
          }

          try {
            if (await repository.isScheduleRetryable(scheduleId)) {
              result.retryable_schedule_ids.push(scheduleId);
            }
          } catch {
            // 状態を確認できない場合は次回Cronで再試行する。
            result.retryable_schedule_ids.push(scheduleId);
          }
        }
      }

      return result;
    },
  };
}
