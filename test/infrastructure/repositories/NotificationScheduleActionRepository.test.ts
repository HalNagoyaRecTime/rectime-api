import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  NOW,
  clearNotificationFixtures,
  createDeliveryFixture,
  getDelivery,
} from './NotificationScheduleActionFixtures';
import { createNotificationScheduleActionRepository } from '../../../src/infrastructure/repositories/NotificationScheduleActionRepository';
import { createNotificationScheduleActionService } from '../../../src/application/services/NotificationScheduleActionService';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationAudienceResolverService } from '../../../src/application/services/NotificationAudienceResolverService';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';

const repo = createNotificationScheduleActionRepository(env.DB);
const service = createNotificationScheduleActionService(repo);
const resolverRepo = createNotificationAudienceResolverRepository(env.DB);
async function unstarted(userId: number) {
  return createAdminNotificationCommandRepository(env.DB).create({
    actor_user_id: userId,
    push_title: '取消',
    push_body: '本文',
    detail_title: '詳細',
    detail_body: '詳細本文',
    importance: 'normal',
    send_at: NOW.toISOString(),
    audiences: [{ type: 'user', target_id: userId }],
    now: NOW.toISOString(),
  });
}
async function count(table: string, scheduleId: number) {
  return (
    await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM ${table} WHERE notification_schedule_id = ?`
    )
      .bind(scheduleId)
      .first<{ total: number }>()
  )?.total;
}
describe('Schedule再送と取消のD1統合', () => {
  beforeEach(clearNotificationFixtures);
  it('存在するautomatic sourceは再送でき、事前判定後のsource削除は保存時に拒否する', async () => {
    const f = await createDeliveryFixture();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO events (event_id,event_name,start_time,end_time) VALUES (999001,'再送source用Event','0900','1000')"
      ),
      env.DB.prepare(
        "INSERT INTO gathering_spots (gathering_spot_id,gathering_spot_name) VALUES (999001,'再送source用Spot')"
      ),
      env.DB.prepare(
        "INSERT INTO gatherings (gathering_id,event_id,gathering_spot_id,round,gathering_time) VALUES (999001,999001,999001,1,'0900')"
      ),
      env.DB.prepare(
        "UPDATE notifications SET source_type='gathering',source_id=999001,source_hash='test-source' WHERE notification_id = ?"
      ).bind(f.notificationId),
    ]);
    await service.resendSchedule(
      f.scheduleId,
      f.userId,
      { delivery: { type: 'immediate', sendAt: null } },
      NOW
    );
    const original = repo.createResend.bind(repo);
    const spy = vi
      .spyOn(repo, 'createResend')
      .mockImplementationOnce(async input => {
        await env.DB.prepare(
          'DELETE FROM gatherings WHERE gathering_id = 999001'
        ).run();
        return original(input);
      });
    await expect(
      service.resendSchedule(
        f.scheduleId,
        f.userId,
        { delivery: { type: 'immediate', sendAt: null } },
        NOW
      )
    ).rejects.toMatchObject({ code: 'NOTIFICATION_RESEND_NOT_ALLOWED' });
    spy.mockRestore();
    expect(
      (
        await env.DB.prepare(
          'SELECT COUNT(*) AS total FROM notification_schedules'
        ).first<{ total: number }>()
      )?.total
    ).toBe(2);
    expect(
      (
        await env.DB.prepare(
          'SELECT COUNT(*) AS total FROM notification_audiences'
        ).first<{ total: number }>()
      )?.total
    ).toBe(2);
  });
  it('新ScheduleへAudience条件だけをコピーし、Recipientを再解決して新Deliveryを作る', async () => {
    const f = await createDeliveryFixture();
    await env.DB.prepare(
      'INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, ?)'
    )
      .bind(f.userId, `schedule-action-token-${f.scheduleId}`)
      .run();
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name,start_time,end_time) VALUES ('Legacy field test','0900','1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    if (!event)
      throw new Error('Legacy field test用Eventを作成できませんでした');
    await env.DB.prepare(
      `UPDATE notification_schedules
       SET created_user_id = ?, event_id = ?, importance = 3,
           failed_reason = 'legacy failure', fcm_message_id = 'legacy-message'
       WHERE notification_schedule_id = ?`
    )
      .bind(f.userId, event.event_id, f.scheduleId)
      .run();
    const newUser = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('再送時に追加されたUser') RETURNING user_id"
    ).first<{ user_id: number }>();
    if (!newUser) throw new Error('再送時Userを作成できませんでした');
    await env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id,audience_type,target_id,resolved_at) VALUES (?,'user',?,?)"
    )
      .bind(f.scheduleId, newUser.user_id, NOW.toISOString())
      .run();
    const result = await service.resendSchedule(
      f.scheduleId,
      f.userId,
      { delivery: { type: 'scheduled', sendAt: '2026-11-07T15:47:00+09:00' } },
      NOW
    );
    expect(result.notificationId).toBe(f.notificationId);
    expect(result.notificationScheduleId).not.toBe(f.scheduleId);
    const row = await env.DB.prepare(
      `SELECT send_at,send_status,started_at,scheduled_by_user_id,notification_id,
              recipients_resolved_at,completed_at,stopped_at,stopped_by_user_id,reason,
              created_at,updated_at,created_user_id,event_id,importance,firebase_token_id,
              failed_reason,fcm_message_id
       FROM notification_schedules WHERE notification_schedule_id = ?`
    )
      .bind(result.notificationScheduleId)
      .first();
    expect(row).toEqual({
      send_at: '2026-11-07T06:47:00.000Z',
      send_status: 'scheduled',
      started_at: null,
      scheduled_by_user_id: f.userId,
      notification_id: f.notificationId,
      recipients_resolved_at: null,
      completed_at: null,
      stopped_at: null,
      stopped_by_user_id: null,
      reason: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
      created_user_id: null,
      event_id: null,
      importance: 2,
      firebase_token_id: null,
      failed_reason: null,
      fcm_message_id: null,
    });
    const audience = await env.DB.prepare(
      'SELECT audience_type,target_id,resolved_at FROM notification_audiences WHERE notification_schedule_id = ? ORDER BY notification_audience_id'
    )
      .bind(result.notificationScheduleId)
      .all();
    expect(audience.results).toHaveLength(2);
    expect(audience.results).toEqual(
      expect.arrayContaining([
        { audience_type: 'user', target_id: f.userId, resolved_at: null },
        {
          audience_type: 'user',
          target_id: newUser.user_id,
          resolved_at: null,
        },
      ])
    );
    expect(
      await count('notification_recipients', result.notificationScheduleId)
    ).toBe(0);
    expect(
      (
        await env.DB.prepare(
          'SELECT COUNT(*) AS total FROM notifications WHERE notification_id = ?'
        )
          .bind(f.notificationId)
          .first<{ total: number }>()
      )?.total
    ).toBe(1);
    expect(
      (
        await env.DB.prepare(
          'SELECT COUNT(*) AS total FROM notification_push_deliveries'
        ).first<{ total: number }>()
      )?.total
    ).toBe(1);
    const due = new Date('2026-11-07T06:47:00Z');
    await createNotificationAudienceResolverService(
      resolverRepo
    ).resolveDueSchedules(due);
    const recipients = await env.DB.prepare(
      'SELECT user_id FROM notification_recipients WHERE notification_schedule_id = ? ORDER BY user_id'
    )
      .bind(result.notificationScheduleId)
      .all<{ user_id: number }>();
    expect(recipients.results.map(r => r.user_id)).toEqual([
      f.userId,
      newUser.user_id,
    ]);
    await createNotificationDeliveryRepository(env.DB).prepareResolvedSchedule(
      result.notificationScheduleId,
      due.toISOString()
    );
    expect(
      (
        await env.DB.prepare(
          'SELECT COUNT(*) AS total FROM notification_push_deliveries'
        ).first<{ total: number }>()
      )?.total
    ).toBe(2);
    expect(
      await getDelivery(f.delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'sending', attempt_count: 1 });
  });
  it('Audienceコピーが失敗したD1 batchでは新Scheduleもrollbackする', async () => {
    const f = await createDeliveryFixture();
    await env.DB.prepare(
      `CREATE TRIGGER fail_resend_audience_copy
       BEFORE INSERT ON notification_audiences
       WHEN NEW.notification_schedule_id <> ${f.scheduleId}
       BEGIN SELECT RAISE(ABORT, 'Audience copy failed'); END`
    ).run();
    try {
      await expect(
        repo.createResend({
          schedule_id: f.scheduleId,
          actor_user_id: f.userId,
          send_at: NOW.toISOString(),
          now: NOW.toISOString(),
        })
      ).rejects.toThrow('Audience copy failed');
      expect(
        (
          await env.DB.prepare(
            'SELECT COUNT(*) AS total FROM notification_schedules WHERE notification_id = ?'
          )
            .bind(f.notificationId)
            .first<{ total: number }>()
        )?.total
      ).toBe(1);
    } finally {
      await env.DB.prepare(
        'DROP TRIGGER IF EXISTS fail_resend_audience_copy'
      ).run();
    }
  });
  it.each([
    'scheduled',
    'resolving',
    'sending',
    'completed',
    'failed',
    'stopped',
  ])('%sから同じNotificationへ即時再送する', async status => {
    const f = await createDeliveryFixture();
    await env.DB.prepare(
      'UPDATE notification_schedules SET send_status = ? WHERE notification_schedule_id = ?'
    )
      .bind(status, f.scheduleId)
      .run();
    const result = await service.resendSchedule(
      f.scheduleId,
      f.userId,
      { delivery: { type: 'immediate', sendAt: null } },
      NOW
    );
    expect(
      await env.DB.prepare(
        'SELECT notification_id,send_status,send_at FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(result.notificationScheduleId)
        .first()
    ).toEqual({
      notification_id: f.notificationId,
      send_status: 'scheduled',
      send_at: NOW.toISOString(),
    });
  });
  it('削除済みautomatic sourceは条件付きINSERTでも拒否しAudienceを他Scheduleへ混入させない', async () => {
    const f = await createDeliveryFixture();
    await env.DB.prepare(
      "UPDATE notifications SET source_type='gathering',source_id=999999,source_hash='test-deleted-source' WHERE notification_id = ?"
    )
      .bind(f.notificationId)
      .run();
    expect(
      await repo.createResend({
        schedule_id: f.scheduleId,
        actor_user_id: f.userId,
        send_at: NOW.toISOString(),
        now: NOW.toISOString(),
      })
    ).toEqual({ status: 'not_allowed' });
    await expect(
      service.resendSchedule(
        f.scheduleId,
        f.userId,
        { delivery: { type: 'immediate', sendAt: null } },
        NOW
      )
    ).rejects.toMatchObject({ code: 'NOTIFICATION_RESEND_NOT_ALLOWED' });
    expect(await count('notification_audiences', f.scheduleId)).toBe(1);
    expect(
      (
        await env.DB.prepare(
          'SELECT COUNT(*) AS total FROM notification_schedules'
        ).first<{ total: number }>()
      )?.total
    ).toBe(1);
  });
  it('未開始だけをDELETEしAudienceをcascadeするがNotificationは残す', async () => {
    const f = await createDeliveryFixture();
    const created = await unstarted(f.userId);
    await service.cancelSchedule(created.notification_schedule_id);
    expect(
      await repo.findActionSnapshot(created.notification_schedule_id)
    ).toBeNull();
    expect(
      await count('notification_audiences', created.notification_schedule_id)
    ).toBe(0);
    expect(
      await env.DB.prepare(
        'SELECT notification_id FROM notifications WHERE notification_id = ?'
      )
        .bind(created.notification_id)
        .first()
    ).not.toBeNull();
  });
  it('開始済み・sendingでは直接DELETEも拒否して履歴を保持する', async () => {
    const f = await createDeliveryFixture();
    expect(await repo.cancelUnstarted(f.scheduleId)).toBe('not_allowed');
    await expect(service.cancelSchedule(f.scheduleId)).rejects.toMatchObject({
      code: 'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED',
    });
    expect(
      await getDelivery(f.delivery.notification_push_delivery_id)
    ).toMatchObject({ status: 'sending' });
    const created = await unstarted(f.userId);
    await env.DB.prepare(
      'UPDATE notification_schedules SET started_at = ? WHERE notification_schedule_id = ?'
    )
      .bind(NOW.toISOString(), created.notification_schedule_id)
      .run();
    expect(await repo.cancelUnstarted(created.notification_schedule_id)).toBe(
      'not_allowed'
    );
  });
  it('recipients_resolved_atあり、またはRecipientが存在するScheduleは取消できない', async () => {
    const f = await createDeliveryFixture();
    const unresolvedRecipient = await unstarted(f.userId);
    await env.DB.prepare(
      'UPDATE notification_schedules SET recipients_resolved_at = ? WHERE notification_schedule_id = ?'
    )
      .bind(NOW.toISOString(), unresolvedRecipient.notification_schedule_id)
      .run();
    expect(
      await repo.cancelUnstarted(unresolvedRecipient.notification_schedule_id)
    ).toBe('not_allowed');

    const recipientSchedule = await unstarted(f.userId);
    await env.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?)'
    )
      .bind(recipientSchedule.notification_schedule_id, f.userId)
      .run();
    expect(
      await repo.cancelUnstarted(recipientSchedule.notification_schedule_id)
    ).toBe('not_allowed');
  });
  it('事前判定後にWorkerがclaimしてもDELETE時点の再検証で409にする', async () => {
    const f = await createDeliveryFixture();
    const created = await unstarted(f.userId);
    const original = repo.cancelUnstarted.bind(repo);
    const spy = vi
      .spyOn(repo, 'cancelUnstarted')
      .mockImplementationOnce(async id => {
        expect(await resolverRepo.claimScheduled(id, NOW.toISOString())).toBe(
          true
        );
        return original(id);
      });
    await expect(
      service.cancelSchedule(created.notification_schedule_id)
    ).rejects.toMatchObject({
      code: 'NOTIFICATION_SCHEDULE_CANCEL_NOT_ALLOWED',
    });
    spy.mockRestore();
    expect(
      await repo.findActionSnapshot(created.notification_schedule_id)
    ).toMatchObject({
      send_status: 'resolving',
      started_at: NOW.toISOString(),
    });
  });
  it('Worker claimとの同時実行ではclaimとDELETEの片方だけが成功する', async () => {
    const f = await createDeliveryFixture();
    const created = await unstarted(f.userId);
    const [cancelled, claimed] = await Promise.all([
      repo.cancelUnstarted(created.notification_schedule_id),
      resolverRepo.claimScheduled(
        created.notification_schedule_id,
        NOW.toISOString()
      ),
    ]);
    expect(cancelled === 'deleted').toBe(!claimed);
    if (claimed)
      expect(
        await repo.findActionSnapshot(created.notification_schedule_id)
      ).toMatchObject({ send_status: 'resolving' });
    else
      expect(
        await repo.findActionSnapshot(created.notification_schedule_id)
      ).toBeNull();
  });
});
