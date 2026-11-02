import { describe, expect, it } from 'vitest';
import { createGatheringNotificationCleanupService } from '../../../src/application/services/GatheringNotificationCleanupService';
import { GATHERING_NOTIFICATION_CLEANUP_POLICY } from '../../../src/domain/entities/GatheringNotificationCleanup';

describe('GatheringNotificationCleanupService', () => {
  const service = createGatheringNotificationCleanupService();

  it('削除対象が無い場合はnullを返す', () => {
    expect(service.prepareCleanup([])).toBeNull();
    expect(service.prepareCleanup([0, -1, 1.5])).toBeNull();
  });

  it('重複と不正なIDを除き、共通停止ルールのsource_deleted policyを返す', () => {
    expect(
      service.prepareCleanup(
        [102, 101, 102, 0, -1, 1.5],
        new Date('2026-10-22T09:00:00.000Z')
      )
    ).toEqual({
      gathering_ids: [102, 101],
      stop_policy: {
        stopped_by_user_id: null,
        reason: 'source_deleted',
        allowed_statuses: ['resolving', 'sending'],
        now: '2026-10-22T09:00:00.000Z',
      },
      cleanup_policy: GATHERING_NOTIFICATION_CLEANUP_POLICY,
    });
  });
});
