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
import {
  FCM_RETRY_WINDOW_SECONDS,
  FCM_CONFIG_BLOCKED_REASON,
  FCM_CONFIG_RETRY_DELAY_SECONDS,
} from '../../../src/domain/entities/NotificationRetryPolicy';

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
  it('FCM権限403は期限超過後も保留し、1日後の復旧で同じDeliveryを送信する', async () => {
    const { delivery, scheduleId } = await createDeliveryFixture();
    const blocked = harness(
      new FcmRequestError(403, 'PERMISSION_DENIED', 'FCM権限不足')
    );
    expect(await blocked.service.sendClaimedDelivery(delivery, NOW)).toBe(
      'retry_wait'
    );
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'retry_wait',
      failed_reason: FCM_CONFIG_BLOCKED_REASON,
      next_retry_at: new Date(
        NOW.getTime() + FCM_CONFIG_RETRY_DELAY_SECONDS * 1000
      ).toISOString(),
    });
    const afterDay = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    expect(
      await repository.completeScheduleIfDone(
        scheduleId,
        afterDay.toISOString()
      )
    ).toBe(false);
    expect(
      await repository.retireUnsendableDeliveries(
        afterDay.toISOString(),
        NOW.toISOString(),
        6
      )
    ).toEqual([]);
    const [recovered] = await repository.claimRetryDeliveries(
      afterDay.toISOString(),
      NOW.toISOString(),
      5
    );
    expect(recovered).toMatchObject({
      notification_push_delivery_id: delivery.notification_push_delivery_id,
      attempt_count: 1,
      first_attempt_at: afterDay.toISOString(),
    });
    expect(
      await harness().service.sendClaimedDelivery(recovered, afterDay)
    ).toBe('sent');
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'sent', failed_reason: null });
    expect(
      await repository.completeScheduleIfDone(
        scheduleId,
        afterDay.toISOString()
      )
    ).toBe(true);
  });

  it('設定障害後の503は通常のRetry期限を新しく開始する', async () => {
    const { delivery } = await createDeliveryFixture();
    await harness(
      new FcmRequestError(403, 'PERMISSION_DENIED', 'IAM障害')
    ).service.sendClaimedDelivery(delivery, NOW);
    const afterDay = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const [recovered] = await repository.claimRetryDeliveries(
      afterDay.toISOString(),
      NOW.toISOString(),
      5
    );
    expect(
      await harness(
        new FcmRequestError(503, 'UNAVAILABLE', '一時障害')
      ).service.sendClaimedDelivery(recovered, afterDay)
    ).toBe('retry_wait');
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'retry_wait',
      failed_reason: '一時障害',
      first_attempt_at: afterDay.toISOString(),
      next_retry_at: new Date(afterDay.getTime() + 10_000).toISOString(),
    });
  });

  it('設定保留中にStopしたら送信せずstoppedへ遷移する', async () => {
    const { delivery, scheduleId } = await createDeliveryFixture();
    await harness(
      new FcmRequestError(403, 'PERMISSION_DENIED', '権限不足')
    ).service.sendClaimedDelivery(delivery, NOW);
    await env.DB.prepare(
      "UPDATE notification_schedules SET send_status = 'stopped' WHERE notification_schedule_id = ?"
    )
      .bind(scheduleId)
      .run();
    const afterDay = new Date(NOW.getTime() + 24 * 60 * 60 * 1000);
    const retried = harness();
    expect((await retried.service.retryDueDeliveries(afterDay)).claimed).toBe(
      0
    );
    expect(retried.sendNotificationToToken).not.toHaveBeenCalled();
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'stopped',
      next_retry_at: null,
    });
  });

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
  it('最終再送予定とマージンの期限後はFCMを呼ばずDeliveryを終端する', async () => {
    const { delivery } = await createDeliveryFixture();
    await harness(
      new FcmRequestError(503, 'UNAVAILABLE', '一時失敗')
    ).service.sendClaimedDelivery(delivery, NOW);
    const h = harness(new FcmRequestError(503, 'UNAVAILABLE', '一時失敗'));
    await h.service.retryDueDeliveries(
      new Date(NOW.getTime() + FCM_RETRY_WINDOW_SECONDS * 1000 + 1)
    );
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
  it('Retry-Afterでマージン込みの期限を超える429は再送せず失敗にする', async () => {
    const { delivery } = await createDeliveryFixture();
    expect(
      await harness(
        new FcmRequestError(
          429,
          'QUOTA_EXCEEDED',
          '制限',
          FCM_RETRY_WINDOW_SECONDS + 1
        )
      ).service.sendClaimedDelivery(delivery, NOW)
    ).toBe('failed');
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: 'failed',
      next_retry_at: null,
    });
  });
  it.each(['retry_wait', 'sending'] as const)(
    'ミリ秒付き初回時刻の%sを最終再送予定後のcronで送信する',
    async status => {
      const { delivery } = await createDeliveryFixture();
      const firstAttempt = new Date(NOW.getTime() + 3457);
      const lastOffset = Math.max(...FCM_RETRY_OFFSETS_SECONDS);
      const nextRetry = new Date(firstAttempt.getTime() + lastOffset * 1000);
      await env.DB.prepare(
        `UPDATE notification_push_deliveries
         SET status = ?, first_attempt_at = ?, last_attempt_at = ?,
             next_retry_at = ?, attempt_count = ?
         WHERE notification_push_delivery_id = ?`
      )
        .bind(
          status,
          firstAttempt.toISOString(),
          firstAttempt.toISOString(),
          status === 'retry_wait' ? nextRetry.toISOString() : null,
          FCM_RETRY_OFFSETS_SECONDS.length,
          delivery.notification_push_delivery_id
        )
        .run();
      const h = harness();
      if (status === 'retry_wait') {
        await h.service.retryDueDeliveries(
          new Date(Math.floor(nextRetry.getTime() / 60_000) * 60_000)
        );
        expect(h.sendNotificationToToken).not.toHaveBeenCalled();
      }
      await h.service.retryDueDeliveries(
        new Date(Math.ceil(nextRetry.getTime() / 60_000) * 60_000)
      );
      expect(h.sendNotificationToToken).toHaveBeenCalledTimes(1);
      expect(
        await getDelivery(delivery.notification_push_delivery_id)
      ).toMatchObject({
        status: 'sent',
        attempt_count: FCM_RETRY_OFFSETS_SECONDS.length + 1,
      });
    }
  );
  it.each([0, 1])('マージン込みの期限から%sミリ秒後の取得境界', async delta => {
    const { delivery } = await createDeliveryFixture();
    const firstAttempt = new Date(NOW.getTime() + 3457);
    await env.DB.prepare(
      `UPDATE notification_push_deliveries
       SET status = 'retry_wait', first_attempt_at = ?, next_retry_at = ?
       WHERE notification_push_delivery_id = ?`
    )
      .bind(
        firstAttempt.toISOString(),
        firstAttempt.toISOString(),
        delivery.notification_push_delivery_id
      )
      .run();
    const h = harness();
    await h.service.retryDueDeliveries(
      new Date(firstAttempt.getTime() + FCM_RETRY_WINDOW_SECONDS * 1000 + delta)
    );
    expect(h.sendNotificationToToken).toHaveBeenCalledTimes(
      delta === 0 ? 1 : 0
    );
    expect(
      await getDelivery(delivery.notification_push_delivery_id)
    ).toMatchObject({
      status: delta === 0 ? 'sent' : 'failed',
    });
  });
  it('Retry-Afterによる最終予定後の再送を期限マージン内なら許可する', async () => {
    const { delivery } = await createDeliveryFixture();
    const retryAfter = FCM_RETRY_WINDOW_SECONDS - 30;
    expect(
      await harness(
        new FcmRequestError(429, 'QUOTA_EXCEEDED', '制限', retryAfter)
      ).service.sendClaimedDelivery(delivery, NOW)
    ).toBe('retry_wait');
    const h = harness();
    await h.service.retryDueDeliveries(
      new Date(NOW.getTime() + retryAfter * 1000)
    );
    expect(h.sendNotificationToToken).toHaveBeenCalledTimes(1);
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

describe('配信所有権と再送Queueの回帰', () => {
  beforeEach(clearNotificationFixtures);
  it('回収された古いWorkerはFCMを呼ばず、期限切れleaseも延長しない', async () => {
    const { delivery } = await createDeliveryFixture();
    const h = harness();
    const later = new Date(NOW.getTime() + 121_000);
    expect(await h.service.sendClaimedDelivery(delivery, later)).toBe(
      'superseded'
    );
    const [reclaimed] = await repository.claimRetryDeliveries(
      later.toISOString(),
      new Date(NOW.getTime() + 1000).toISOString(),
      5
    );
    expect(reclaimed.attempt_count).toBe(2);
    expect(await h.service.sendClaimedDelivery(delivery, later)).toBe(
      'superseded'
    );
    expect(h.sendNotificationToToken).not.toHaveBeenCalled();
    expect(await h.service.sendClaimedDelivery(reclaimed, later)).toBe('sent');
    expect(h.sendNotificationToToken).toHaveBeenCalledTimes(1);
  });

  it('1500件の同時失敗を全件Queueへ分散し、重複Queueでも各Deliveryを一度だけ再送する', async () => {
    const fixture = await createDeliveryFixture();
    const row = await env.DB.prepare(
      'SELECT notification_recipient_id FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
    )
      .bind(fixture.delivery.notification_push_delivery_id)
      .first<{ notification_recipient_id: number }>();
    for (let offset = 1; offset < 1500; offset += 100) {
      const commands = [];
      for (let index = offset; index < Math.min(offset + 100, 1500); index++) {
        commands.push(
          env.DB.prepare(
            `INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, ?)`
          ).bind(fixture.userId, `retry-load-${index}`)
        );
        commands.push(
          env.DB.prepare(
            `INSERT INTO notification_push_deliveries
          (notification_recipient_id, firebase_token_id, platform, status, attempt_count, first_attempt_at, last_attempt_at, next_retry_at, created_at, updated_at)
          VALUES (?, (SELECT firebase_token_id FROM firebase_tokens WHERE fcm_token = ?), 1, 'retry_wait', 1, ?, ?, ?, ?, ?)`
          ).bind(
            row!.notification_recipient_id,
            `retry-load-${index}`,
            ...Array(5).fill(NOW.toISOString())
          )
        );
      }
      await env.DB.batch(commands);
    }
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET status = 'retry_wait', next_retry_at = ?"
    )
      .bind(NOW.toISOString())
      .run();
    const messages: import('../../../src/domain/entities/NotificationDelivery').NotificationDeliveryMessage[] =
      [];
    const h = harness();
    const service = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: tokens,
      fcmService: { sendNotificationToToken: h.sendNotificationToToken },
      notificationDeliveryQueue: {
        enqueueMany: async batch => {
          messages.push(...batch);
        },
      },
    });
    const now = new Date(NOW.getTime() + 60_000);
    expect(await service.enqueueDueDeliveries(now)).toBe(1500);
    expect(h.sendNotificationToToken).not.toHaveBeenCalled();
    expect(
      messages.every(message => message.retryDeliveryIds!.length <= 90)
    ).toBe(true);
    for (const message of messages)
      await service.retryDueDeliveries(now, message.retryDeliveryIds);
    // Queueの重複配送でも完了済みattemptをclaimしない。
    for (const message of messages)
      await service.retryDueDeliveries(now, message.retryDeliveryIds);
    expect(h.sendNotificationToToken).toHaveBeenCalledTimes(1500);
    const result = await env.DB.prepare(
      "SELECT count(*) AS count FROM notification_push_deliveries WHERE status = 'sent'"
    ).first<{ count: number }>();
    expect(result!.count).toBe(1500);
  }, 60000);
});

it('FCM待機中の6件目をclaimせず、送信枠が空いてから取得する', async () => {
  await clearNotificationFixtures();
  const fixture = await createDeliveryFixture();
  const recipient = await env.DB.prepare(
    'SELECT notification_recipient_id FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
  )
    .bind(fixture.delivery.notification_push_delivery_id)
    .first<{ notification_recipient_id: number }>();
  for (let i = 0; i < 5; i++) {
    const token = await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, ?) RETURNING firebase_token_id'
    )
      .bind(fixture.userId, `waiting-${i}`)
      .first<{ firebase_token_id: number }>();
    await env.DB.prepare(
      "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status) VALUES (?, ?, 1, 'pending')"
    )
      .bind(recipient!.notification_recipient_id, token!.firebase_token_id)
      .run();
  }
  await env.DB.prepare(
    "UPDATE notification_push_deliveries SET status = 'pending', attempt_count = 0, first_attempt_at = NULL, last_attempt_at = NULL"
  ).run();
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const firstWave = new Promise<void>(resolve => {
    started = resolve;
  });
  let calls = 0;
  const { createNotificationDeliveryService } =
    await import('../../../src/application/services/NotificationDeliveryService');
  const service = createNotificationDeliveryService({
    notificationDeliveryRepository: repository,
    firebaseTokenRepository: tokens,
    notificationDeliveryQueue: { enqueueMany: async () => {} },
    fcmService: {
      sendNotificationToToken: async () => {
        calls++;
        if (calls === 5) started();
        await gate;
        return { success: true, messageId: 'sent' };
      },
    },
  });
  const sending = service.sendQueuedNotifications([fixture.scheduleId], NOW);
  await firstWave;
  try {
    expect(
      await env.DB.prepare(
        "SELECT count(*) AS count FROM notification_push_deliveries WHERE status = 'pending'"
      ).first()
    ).toMatchObject({ count: 1 });
  } finally {
    release();
    await sending;
  }
  expect(calls).toBe(6);
});
