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
import { createNotificationStopRepository } from '../../../src/infrastructure/repositories/NotificationStopRepository';
import { createNotificationStopService } from '../../../src/application/services/NotificationStopService';
import { createNotificationRetryService } from '../../../src/application/services/NotificationRetryService';
import { FcmRequestError } from '../../../src/application/services/IFcmService';

const stop = createNotificationStopService(
  createNotificationStopRepository(env.DB)
);
describe('Stopの条件付きUPDATEとFCM競合', () => {
  beforeEach(clearNotificationFixtures);
  it('StopとRetryの競合後も新しいRetryを開始しない', async () => {
    const f = await createDeliveryFixture();
    const sendNotificationToToken = vi.fn(async () => {
      throw new FcmRequestError(503, 'UNAVAILABLE', '一時失敗');
    });
    const retry = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: tokens,
      fcmService: { sendNotificationToToken },
    });
    await retry.sendClaimedDelivery(f.delivery, NOW);
    const due = new Date(NOW.getTime() + 11_000);
    await Promise.all([
      stop.stopSchedule(
        {
          scheduleId: f.scheduleId,
          reason: 'manual',
          stoppedByUserId: f.userId,
        },
        due
      ),
      retry.retryDueDeliveries(due),
    ]);
    const calls = sendNotificationToToken.mock.calls.length;
    await retry.retryDueDeliveries(new Date(NOW.getTime() + 900_000));
    expect(sendNotificationToToken).toHaveBeenCalledTimes(calls);
    expect(
      await getDelivery(f.delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'stopped', next_retry_at: null });
  });
  it('Stop後のtimeout回収は新しいFCM requestを開始しない', async () => {
    const f = await createDeliveryFixture();
    const sendNotificationToToken = vi.fn(async () => ({
      success: true as const,
      messageId: 'projects/test/messages/unused',
    }));
    const retry = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: tokens,
      fcmService: { sendNotificationToToken },
    });
    await stop.stopSchedule(
      {
        scheduleId: f.scheduleId,
        reason: 'manual',
        stoppedByUserId: f.userId,
      },
      NOW
    );
    await retry.retryDueDeliveries(new Date(NOW.getTime() + 121_000));
    expect(sendNotificationToToken).not.toHaveBeenCalled();
    expect(
      await getDelivery(f.delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'stopped', next_retry_at: null });
  });
  it('Stop後の429 retry_waitは期限到来後も再送しない', async () => {
    const f = await createDeliveryFixture();
    const sendNotificationToToken = vi.fn(async () => {
      throw new FcmRequestError(429, 'QUOTA_EXCEEDED', 'レート制限');
    });
    const retry = createNotificationRetryService({
      notificationDeliveryRepository: repository,
      firebaseTokenRepository: tokens,
      fcmService: { sendNotificationToToken },
    });
    await retry.sendClaimedDelivery(f.delivery, NOW);
    await stop.stopSchedule(
      {
        scheduleId: f.scheduleId,
        reason: 'manual',
        stoppedByUserId: f.userId,
      },
      new Date(NOW.getTime() + 1000)
    );
    await retry.retryDueDeliveries(new Date(NOW.getTime() + 70_000));
    expect(sendNotificationToToken).toHaveBeenCalledTimes(1);
    expect(
      await getDelivery(f.delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'stopped', next_retry_at: null });
  });
  it.each(['scheduled', 'completed', 'failed', 'stopped'])(
    'source_deletedは%sを巻き戻さない',
    async status => {
      const f = await createDeliveryFixture();
      await env.DB.prepare(
        'UPDATE notification_schedules SET send_status = ? WHERE notification_schedule_id = ?'
      )
        .bind(status, f.scheduleId)
        .run();
      await expect(
        stop.stopSchedule(
          { scheduleId: f.scheduleId, reason: 'source_deleted' },
          NOW
        )
      ).rejects.toMatchObject({
        code: 'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED',
      });
      expect(
        await getDelivery(f.delivery.notification_push_delivery_id)
      ).toMatchObject({ status: 'sending' });
    }
  );
  it('pending・retry_waitだけを停止し監査と全履歴を保持する', async () => {
    const f = await createDeliveryFixture();
    for (const status of ['pending', 'retry_wait', 'sent', 'failed'])
      await env.DB.prepare(
        `INSERT INTO notification_push_deliveries (notification_recipient_id,firebase_token_id,platform,status,attempt_count) SELECT notification_recipient_id,NULL,1,?,0 FROM notification_push_deliveries WHERE notification_push_delivery_id = ?`
      )
        .bind(status, f.delivery.notification_push_delivery_id)
        .run();
    await stop.stopSchedule(
      { scheduleId: f.scheduleId, reason: 'manual', stoppedByUserId: f.userId },
      NOW
    );
    const rows = await env.DB.prepare(
      'SELECT status FROM notification_push_deliveries ORDER BY notification_push_delivery_id'
    ).all<{ status: string }>();
    expect(rows.results.map(r => r.status)).toEqual([
      'sending',
      'stopped',
      'stopped',
      'sent',
      'failed',
    ]);
    expect(
      await env.DB.prepare(
        'SELECT send_status,stopped_at,stopped_by_user_id,reason FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(f.scheduleId)
        .first()
    ).toEqual({
      send_status: 'stopped',
      stopped_at: NOW.toISOString(),
      stopped_by_user_id: f.userId,
      reason: 'manual',
    });
    expect(
      await repository.claimPendingDeliveries(
        [f.scheduleId],
        NOW.toISOString(),
        100
      )
    ).toEqual([]);
    expect(
      await repository.completeScheduleIfDone(f.scheduleId, NOW.toISOString())
    ).toBe(false);
    await env.DB.prepare(
      `INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status, attempt_count, updated_at)
       SELECT notification_recipient_id, NULL, 1, 'pending', 0, '2026-10-02T00:00:00.000Z' FROM notification_recipients WHERE notification_schedule_id = ?`
    )
      .bind(f.scheduleId)
      .run();
    await expect(
      stop.stopSchedule(
        {
          scheduleId: f.scheduleId,
          reason: 'manual',
          stoppedByUserId: f.userId,
        },
        new Date(NOW.getTime() + 1000)
      )
    ).rejects.toMatchObject({ code: 'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED' });
    const lateDelivery = await env.DB.prepare(
      `SELECT d.status, d.updated_at FROM notification_push_deliveries d
       JOIN notification_recipients r USING (notification_recipient_id)
       WHERE r.notification_schedule_id = ? AND d.firebase_token_id IS NULL
       ORDER BY d.notification_push_delivery_id DESC LIMIT 1`
    )
      .bind(f.scheduleId)
      .first();
    expect(lateDelivery).toMatchObject({
      status: 'pending',
      updated_at: '2026-10-02T00:00:00.000Z',
    });
  });
  it.each(['scheduled', 'resolving', 'completed', 'failed', 'stopped'])(
    'public Stopは%sを拒否する',
    async status => {
      const f = await createDeliveryFixture();
      await env.DB.prepare(
        'UPDATE notification_schedules SET send_status = ? WHERE notification_schedule_id = ?'
      )
        .bind(status, f.scheduleId)
        .run();
      await expect(
        stop.stopSchedule({
          scheduleId: f.scheduleId,
          reason: 'manual',
          stoppedByUserId: f.userId,
        })
      ).rejects.toMatchObject({
        code: 'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED',
      });
      expect(
        await getDelivery(f.delivery.notification_push_delivery_id)
      ).toMatchObject({ status: 'sending' });
    }
  );
  it.each(['resolving', 'sending'])(
    'source_deletedで%sを停止してUserをNULLにする',
    async status => {
      const f = await createDeliveryFixture();
      await env.DB.prepare(
        'UPDATE notification_schedules SET send_status = ? WHERE notification_schedule_id = ?'
      )
        .bind(status, f.scheduleId)
        .run();
      await stop.stopSchedule(
        { scheduleId: f.scheduleId, reason: 'source_deleted' },
        NOW
      );
      expect(
        await env.DB.prepare(
          'SELECT send_status,stopped_by_user_id,reason FROM notification_schedules WHERE notification_schedule_id = ?'
        )
          .bind(f.scheduleId)
          .first()
      ).toEqual({
        send_status: 'stopped',
        stopped_by_user_id: null,
        reason: 'source_deleted',
      });
    }
  );
  it.each(['success', 'temporary', 'permanent'])(
    'Stop中のFCM %s応答を保存して新しいRetryを開始しない',
    async outcome => {
      const f = await createDeliveryFixture();
      let release!: () => void;
      const blocked = new Promise<void>(resolve => {
        release = resolve;
      });
      const sendNotificationToToken = vi.fn(async () => {
        await blocked;
        if (outcome !== 'success')
          throw new FcmRequestError(
            outcome === 'temporary' ? 503 : 400,
            outcome === 'temporary' ? 'UNAVAILABLE' : 'INVALID_ARGUMENT',
            '送信失敗'
          );
        return {
          success: true as const,
          messageId: 'projects/test/messages/stopped',
        };
      });
      const retry = createNotificationRetryService({
        notificationDeliveryRepository: repository,
        firebaseTokenRepository: tokens,
        fcmService: { sendNotificationToToken },
      });
      const sending = retry.sendClaimedDelivery(f.delivery, NOW);
      await stop.stopSchedule(
        {
          scheduleId: f.scheduleId,
          reason: 'manual',
          stoppedByUserId: f.userId,
        },
        NOW
      );
      expect(
        await getDelivery(f.delivery.notification_push_delivery_id)
      ).toMatchObject({ status: 'sending' });
      release();
      await sending;
      expect(
        await getDelivery(f.delivery.notification_push_delivery_id)
      ).toMatchObject({
        status:
          outcome === 'success'
            ? 'sent'
            : outcome === 'temporary'
              ? 'stopped'
              : 'failed',
        next_retry_at: null,
      });
      await retry.retryDueDeliveries(new Date(NOW.getTime() + 121_000));
      expect(sendNotificationToToken).toHaveBeenCalledTimes(1);
    }
  );
  it('StopとDelivery claimの同時実行後に新しいclaimを許可しない', async () => {
    const f = await createDeliveryFixture();
    await env.DB.prepare(
      "UPDATE notification_push_deliveries SET status = 'pending',attempt_count=0 WHERE notification_push_delivery_id = ?"
    )
      .bind(f.delivery.notification_push_delivery_id)
      .run();
    await Promise.all([
      stop.stopSchedule(
        {
          scheduleId: f.scheduleId,
          reason: 'manual',
          stoppedByUserId: f.userId,
        },
        NOW
      ),
      repository.claimPendingDeliveries([f.scheduleId], NOW.toISOString(), 100),
    ]);
    expect(
      await repository.claimPendingDeliveries(
        [f.scheduleId],
        NOW.toISOString(),
        100
      )
    ).toEqual([]);
    expect(['stopped', 'sending']).toContain(
      (await getDelivery(f.delivery.notification_push_delivery_id))?.status
    );
  });
  it('重複Stopは1Workerだけ成功し停止監査を上書きしない', async () => {
    const f = await createDeliveryFixture();
    const results = await Promise.allSettled([
      stop.stopSchedule(
        {
          scheduleId: f.scheduleId,
          reason: 'manual',
          stoppedByUserId: f.userId,
        },
        NOW
      ),
      stop.stopSchedule(
        { scheduleId: f.scheduleId, reason: 'source_deleted' },
        new Date(NOW.getTime() + 1000)
      ),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
  });
  it('Stop直前にcompletedとなったScheduleを巻き戻さない', async () => {
    const f = await createDeliveryFixture();
    await repository.markSent(
      f.delivery.notification_push_delivery_id,
      '成功',
      NOW.toISOString(),
      1
    );
    await repository.completeScheduleIfDone(f.scheduleId, NOW.toISOString());
    await expect(
      stop.stopSchedule(
        {
          scheduleId: f.scheduleId,
          reason: 'manual',
          stoppedByUserId: f.userId,
        },
        NOW
      )
    ).rejects.toMatchObject({ code: 'NOTIFICATION_SCHEDULE_STOP_NOT_ALLOWED' });
    expect(
      await getDelivery(f.delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'sent' });
  });
});
