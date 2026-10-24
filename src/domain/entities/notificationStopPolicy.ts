import type {
  NotificationStopPolicy,
  NotificationStopPolicyCommand,
} from './NotificationStop';

export function buildNotificationStopPolicy(
  command: NotificationStopPolicyCommand,
  now = new Date()
): NotificationStopPolicy {
  return {
    stopped_by_user_id:
      command.reason === 'manual' ? command.stoppedByUserId : null,
    reason: command.reason,
    allowed_statuses:
      command.reason === 'manual' ? ['sending'] : ['resolving', 'sending'],
    now: now.toISOString(),
  };
}
