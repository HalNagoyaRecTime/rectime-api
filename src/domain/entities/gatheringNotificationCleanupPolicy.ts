import type { GatheringNotificationCleanupPlan } from './GatheringNotificationCleanup';

function hasExactly<T extends string>(actual: T[], required: T[]): boolean {
  const values = new Set(actual);
  return (
    values.size === required.length &&
    required.every(value => values.has(value))
  );
}

// source削除後の配信防止と開始済み履歴の保持は、policyの差し替えでも緩和しない。
export function assertGatheringNotificationCleanupPolicy(
  plan: GatheringNotificationCleanupPlan
): void {
  const { cleanup_policy: cleanup, stop_policy: stop } = plan;
  if (
    !hasExactly(cleanup.schedule.delete_statuses, ['scheduled']) ||
    !cleanup.schedule.delete_only_unstarted ||
    cleanup.schedule.stopped_status !== 'stopped' ||
    !hasExactly(stop.allowed_statuses, ['resolving', 'sending']) ||
    stop.reason !== 'source_deleted' ||
    stop.stopped_by_user_id !== null ||
    !hasExactly(cleanup.delivery.stop_statuses, ['pending', 'retry_wait']) ||
    cleanup.delivery.stopped_status !== 'stopped' ||
    cleanup.notification.source_type !== 'gathering' ||
    cleanup.notification.notification_type !== 'notification_general'
  ) {
    throw new Error(
      '集合削除時の通知cleanup policyが確定仕様を満たしていません'
    );
  }
}
