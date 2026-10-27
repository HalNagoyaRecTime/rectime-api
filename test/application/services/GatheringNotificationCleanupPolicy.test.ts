import { describe, expect, it } from 'vitest';
import { createGatheringNotificationCleanupService } from '../../../src/application/services/GatheringNotificationCleanupService';
import { assertGatheringNotificationCleanupPolicy } from '../../../src/domain/entities/gatheringNotificationCleanupPolicy';
import type { GatheringNotificationCleanupPlan } from '../../../src/domain/entities/GatheringNotificationCleanup';

describe('Gathering通知cleanupの不変条件', () => {
  const mutations: Array<
    [string, (plan: GatheringNotificationCleanupPlan) => void]
  > = [
    [
      '送信待ちを放置する',
      plan => {
        plan.cleanup_policy.schedule.delete_statuses = [];
      },
    ],
    [
      '準備中を放置する',
      plan => {
        plan.stop_policy.allowed_statuses = ['sending'];
      },
    ],
    [
      '配信中を放置する',
      plan => {
        plan.stop_policy.allowed_statuses = ['resolving'];
      },
    ],
    [
      '完了履歴を削除する',
      plan => {
        plan.cleanup_policy.schedule.delete_statuses.push('completed');
      },
    ],
    [
      '開始済みを削除する',
      plan => {
        plan.cleanup_policy.schedule.delete_only_unstarted = false;
      },
    ],
    [
      '送信中Deliveryを停止する',
      plan => {
        plan.cleanup_policy.delivery.stop_statuses.push('sending');
      },
    ],
    [
      'Retry待ちを放置する',
      plan => {
        plan.cleanup_policy.delivery.stop_statuses = ['pending'];
      },
    ],
    [
      '監査理由を変える',
      plan => {
        plan.stop_policy.reason = 'manual';
      },
    ],
    [
      '停止者を偽る',
      plan => {
        plan.stop_policy.stopped_by_user_id = 1;
      },
    ],
  ];

  it.each(mutations)('%s policyを拒否する', (_, mutate) => {
    const plan = structuredClone(
      createGatheringNotificationCleanupService().prepareCleanup([1])!
    );
    mutate(plan);
    expect(() => assertGatheringNotificationCleanupPolicy(plan)).toThrow(
      '通知cleanup policy'
    );
  });
});
