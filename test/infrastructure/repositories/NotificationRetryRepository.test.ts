import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOW,
  repository,
  tokens,
  clearNotificationFixtures,
  createDeliveryFixture,
  getDelivery,
} from '../../notificationDeliveryFixtures';
import {
  createNotificationRetryService,
  FCM_RETRY_OFFSETS_SECONDS,
} from '../../../src/application/services/NotificationRetryService';
import { FcmRequestError } from '../../../src/application/services/IFcmService';

function harness(error?: unknown) {
  const sendNotificationToToken = vi.fn(async () => {
    if (error) throw error;
    return {
      success: true as const,
      messageId: 'projects/test/messages/retry',
    };
  });
  const service = createNotificationRetryService({
    notificationDeliveryRepository: repository,
    firebaseTokenRepository: tokens,
    fcmService: { sendNotificationToToken },
  });
  return { service, sendNotificationToToken };
}
describe('Retryとtimeout回収のD1統合', () => {
  beforeEach(clearNotificationFixtures);
  it('timeoutの最終試行を再送せず終端し、Scheduleを完了する', async () => {
    const { delivery, scheduleId } = await createDeliveryFixture();
    await env.DB.prepare(
      'UPDATE notification_push_deliveries SET attempt_count = 6 WHERE notification_push_delivery_id = ?'
    )
      .bind(delivery.notification_push_delivery_id)
      .run();
    const h = harness();
    await h.service.retryDueDeliveries(new Date(NOW.getTime() + 121_000));
    expect(h.sendNotificationToToken).not.toHaveBeenCalled();
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'failed',
      attempt_count: 6,
      next_retry_at: null,
    });
    expect(
      await env.DB.prepare(
        'SELECT send_status FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(scheduleId)
        .first()
    ).toMatchObject({ send_status: 'completed' });
  });
  it('回収後のsendingを古いWorkerの成功・失敗で上書きしない', async () => {
    const { delivery } = await createDeliveryFixture();
    const now = new Date(NOW.getTime() + 121_000).toISOString();
    const [reclaimed] = await repository.claimRetryDeliveries(
      now,
      new Date(NOW.getTime() + 1000).toISOString(),
      100
    );
    expect(reclaimed.attempt_count).toBe(2);
    expect(
      await repository.markSent(
        delivery.notification_push_delivery_id,
        '古い成功',
        now,
        1
      )
    ).toBe(false);
    expect(
      await repository.markFailed(
        delivery.notification_push_delivery_id,
        '古い失敗',
        now,
        1
      )
    ).toBe(false);
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'sending', attempt_count: 2 });
    expect(
      await repository.markSent(
        delivery.notification_push_delivery_id,
        '新しい成功',
        now,
        2
      )
    ).toBe(true);
  });
  it('first_attempt_at基準の全マイルストーンへ再送し、6回目の失敗で終了する', async () => {
    const { delivery, scheduleId } = await createDeliveryFixture();
    const h = harness(new FcmRequestError(503, 'UNAVAILABLE', '一時失敗'));
    const { service } = h;
    let target = delivery;
    let now = NOW;
    for (const offset of FCM_RETRY_OFFSETS_SECONDS) {
      expect(await service.sendClaimedDelivery(target, now)).toBe('retry_wait');
      const next = new Date(NOW.getTime() + offset * 1000);
      expect(
        await getDelivery(delivery.notification_push_delivery_id)
      ).toMatchObject({
        status: 'retry_wait',
        attempt_count: target.attempt_count,
        first_attempt_at: NOW.toISOString(),
        last_attempt_at: now.toISOString(),
        next_retry_at: next.toISOString(),
        failed_reason: '一時失敗',
      });
      expect(
        await repository.completeScheduleIfDone(scheduleId, now.toISOString())
      ).toBe(false);
      expect(
        await repository.claimRetryDeliveries(
          new Date(next.getTime() - 1).toISOString(),
          NOW.toISOString(),
          100
        )
      ).toEqual([]);
      [target] = await repository.claimRetryDeliveries(
        next.toISOString(),
        NOW.toISOString(),
        100
      );
      expect(target.notification_push_delivery_id).toBe(
        delivery.notification_push_delivery_id
      );
      now = next;
    }
    expect(h.sendNotificationToToken).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          type: 'manual',
          notificationId: String(delivery.notification_id),
        },
      })
    );
    expect(target.attempt_count).toBe(6);
    expect(await service.sendClaimedDelivery(target, now)).toBe('failed');
    expect(
      await repository.completeScheduleIfDone(scheduleId, now.toISOString())
    ).toBe(true);
  });
  it('10分復旧時はcatch-upを1回だけ行い、失敗後は15分マイルストーンを使う', async () => {
    const { delivery } = await createDeliveryFixture();
    const h = harness(new FcmRequestError(503, 'UNAVAILABLE', '一時失敗'));
    expect(await h.service.sendClaimedDelivery(delivery, NOW)).toBe(
      'retry_wait'
    );
    h.sendNotificationToToken.mockClear();
    const recoveredAt = new Date(NOW.getTime() + 600_000);
    expect((await h.service.retryDueDeliveries(recoveredAt)).claimed).toBe(1);
    expect(h.sendNotificationToToken).toHaveBeenCalledTimes(1);
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'retry_wait',
      attempt_count: 2,
      first_attempt_at: NOW.toISOString(),
      last_attempt_at: recoveredAt.toISOString(),
      next_retry_at: new Date(NOW.getTime() + 900_000).toISOString(),
    });
  });
  it('15分期限後はFCMを呼ばずDeliveryを終端する', async () => {
    const { delivery } = await createDeliveryFixture();
    await harness(
      new FcmRequestError(503, 'UNAVAILABLE', '一時失敗')
    ).service.sendClaimedDelivery(delivery, NOW);
    const h = harness(new FcmRequestError(503, 'UNAVAILABLE', '一時失敗'));
    await h.service.retryDueDeliveries(new Date(NOW.getTime() + 900_001));
    expect(h.sendNotificationToToken).not.toHaveBeenCalled();
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'failed',
      attempt_count: 1,
      next_retry_at: null,
    });
  });
  it.each([
    [null, 70],
    [20, 70],
    [150, 150],
  ])(
    '429のRetry-After %sと最低70秒の大きい値を使う',
    async (retryAfter, delay) => {
      const { delivery } = await createDeliveryFixture();
      await harness(
        new FcmRequestError(429, 'QUOTA_EXCEEDED', '制限', retryAfter)
      ).service.sendClaimedDelivery(delivery, NOW);
      expect(
        await getDelivery(delivery.notification_push_delivery_id)
      ).toMatchObject({
        next_retry_at: new Date(NOW.getTime() + delay * 1000).toISOString(),
      });
    }
  );
  it('Retry-Afterで15分期限を超える429は再送せず失敗にする', async () => {
    const { delivery } = await createDeliveryFixture();
    expect(
      await harness(
        new FcmRequestError(429, 'QUOTA_EXCEEDED', '制限', 901)
      ).service.sendClaimedDelivery(delivery, NOW)
    ).toBe('failed');
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'failed',
      next_retry_at: null,
    });
  });
  it.each([
    ['UNREGISTERED', 404, true],
    ['INVALID_ARGUMENT', 400, false],
    ['SENDER_ID_MISMATCH', 403, false],
  ] as const)('%sの恒久失敗とToken削除境界', async (code, status, deleted) => {
    const { delivery, tokenId } = await createDeliveryFixture();
    expect(
      await harness(
        new FcmRequestError(status, code, '恒久失敗')
      ).service.sendClaimedDelivery(delivery, NOW)
    ).toBe('failed');
    const token = await env.DB.prepare(
      'SELECT firebase_token_id FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(tokenId)
      .first();
    expect(token === null).toBe(deleted);
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'failed', next_retry_at: null });
  });
  it('120秒以内と境界では回収せず、超過時は1Workerだけが取得し古い応答を保存しない', async () => {
    const { delivery } = await createDeliveryFixture();
    expect(
      (
        await harness().service.retryDueDeliveries(
          new Date(NOW.getTime() + 120_000)
        )
      ).claimed
    ).toBe(0);
    const now = new Date(NOW.getTime() + 120_001);
    const a = harness(),
      b = harness();
    const results = await Promise.all([
      a.service.retryDueDeliveries(now),
      b.service.retryDueDeliveries(now),
    ]);
    expect(results.reduce((sum, r) => sum + r.claimed, 0)).toBe(1);
    expect(
      a.sendNotificationToToken.mock.calls.length +
        b.sendNotificationToToken.mock.calls.length
    ).toBe(1);
    expect(
      await repository.markFailed(
        delivery.notification_push_delivery_id,
        '古い応答',
        now.toISOString(),
        1
      )
    ).toBe(false);
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'sent',
      attempt_count: 2,
      first_attempt_at: NOW.toISOString(),
      last_attempt_at: now.toISOString(),
    });
  });
  it('FCM成功後のDB保存失敗をtimeout後に再送する', async () => {
    const { delivery } = await createDeliveryFixture();
    const mark = vi
      .spyOn(repository, 'markSent')
      .mockRejectedValueOnce(new Error('DB保存失敗'));
    const h = harness();
    await expect(h.service.sendClaimedDelivery(delivery, NOW)).rejects.toThrow(
      'DB保存失敗'
    );
    await h.service.retryDueDeliveries(new Date(NOW.getTime() + 121_000));
    expect(h.sendNotificationToToken).toHaveBeenCalledTimes(2);
    mark.mockRestore();
  });
  it('停止済みScheduleとNULL TokenではRetryを開始しない', async () => {
    const { delivery, scheduleId, tokenId } = await createDeliveryFixture();
    await harness(new Error('通信失敗')).service.sendClaimedDelivery(
      delivery,
      NOW
    );
    await env.DB.prepare(
      "UPDATE notification_schedules SET send_status = 'stopped' WHERE notification_schedule_id = ?"
    )
      .bind(scheduleId)
      .run();
    const h = harness();
    await h.service.retryDueDeliveries(new Date(NOW.getTime() + 121_000));
    expect(h.sendNotificationToToken).not.toHaveBeenCalled();
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'stopped', next_retry_at: null });
    await env.DB.prepare(
      "UPDATE notification_schedules SET send_status = 'sending' WHERE notification_schedule_id = ?"
    )
      .bind(scheduleId)
      .run();
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET status = 'retry_wait' WHERE notification_push_delivery_id = ?"
    )
      .bind(delivery.notification_push_delivery_id)
      .run();
    await tokens.deleteById(tokenId);
    await h.service.retryDueDeliveries(new Date(NOW.getTime() + 122_000));
    expect(h.sendNotificationToToken).not.toHaveBeenCalled();
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'failed', firebase_token_id: null });
  });
});
