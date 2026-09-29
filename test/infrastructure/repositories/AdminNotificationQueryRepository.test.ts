import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createAdminNotificationQueryRepository } from '../../../src/infrastructure/repositories/AdminNotificationQueryRepository';
import {
  buildCommand,
  createFixture,
} from './adminNotificationRepositoryFixtures';

const commandRepository = createAdminNotificationCommandRepository(env.DB);
const repository = createAdminNotificationQueryRepository(env.DB);

describe('AdminNotificationQueryRepository', () => {
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM notification_push_deliveries'),
      env.DB.prepare('DELETE FROM notification_recipients'),
      env.DB.prepare('DELETE FROM notification_audiences'),
      env.DB.prepare('DELETE FROM notification_schedules'),
      env.DB.prepare('DELETE FROM notifications'),
      env.DB.prepare('DELETE FROM firebase_tokens'),
      env.DB.prepare('DELETE FROM gathering_group_members'),
      env.DB.prepare('DELETE FROM gatherings'),
      env.DB.prepare('DELETE FROM gathering_spots'),
      env.DB.prepare('DELETE FROM students'),
      env.DB.prepare('DELETE FROM class_rooms'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('manual Notification detailを取得する', async () => {
    const fixture = await createFixture();
    const created = await commandRepository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );

    await expect(
      repository.findById(created.notification_id)
    ).resolves.toMatchObject({
      notification_id: created.notification_id,
      creation: {
        method: 'manual',
        user: {
          user_id: fixture.actorUserId,
          user_name: '通知Command管理者',
        },
        source: null,
      },
      schedules: [
        {
          notification_schedule_id: created.notification_schedule_id,
          audience: {
            items: [{ type: 'all' }],
            recipient_resolution: {
              status: 'pending',
              resolved_count: 0,
            },
          },
          recipient_push_summary: {
            total_count: 0,
            success_count: 0,
            failed_count: 0,
            no_push_target_count: 0,
          },
        },
      ],
    });
  });
  it('詳細でRecipient単位集計とSource labelを返し、Audienceを一括取得する', async () => {
    const fixture = await createFixture();
    const created = await commandRepository.create(
      buildCommand(fixture.actorUserId, [
        { type: 'gathering', target_id: fixture.gatheringId },
      ])
    );
    await env.DB.prepare(
      "UPDATE notifications SET source_type = 'gathering', source_id = ?, source_hash = 'test-source' WHERE notification_id = ?"
    )
      .bind(fixture.gatheringId, created.notification_id)
      .run();

    const secondSchedule = await env.DB.prepare(
      "INSERT INTO notification_schedules (created_user_id, scheduled_by_user_id, event_id, notification_id, importance, send_status, send_at, created_at, updated_at) VALUES (?, ?, NULL, ?, 1, 'scheduled', ?, ?, ?) RETURNING notification_schedule_id"
    )
      .bind(
        fixture.actorUserId,
        fixture.actorUserId,
        created.notification_id,
        '2026-09-24T11:00:00.000Z',
        '2026-09-24T09:00:00.000Z',
        '2026-09-24T09:00:00.000Z'
      )
      .first<{ notification_schedule_id: number }>();
    if (!secondSchedule) throw new Error('追加Scheduleを作成できませんでした');

    await env.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id, created_at, updated_at) VALUES (?, 'user', ?, ?, ?)"
    )
      .bind(
        secondSchedule.notification_schedule_id,
        fixture.actorUserId,
        '2026-09-24T09:00:00.000Z',
        '2026-09-24T09:00:00.000Z'
      )
      .run();

    const recipientUserIds = [fixture.actorUserId];
    for (let index = 1; index < 4; index += 1) {
      const user = await env.DB.prepare(
        'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
      )
        .bind('通知Command集計対象 ' + index)
        .first<{ user_id: number }>();
      if (!user) throw new Error('集計対象Userを作成できませんでした');
      recipientUserIds.push(user.user_id);
    }

    const recipientIds: number[] = [];
    for (const userId of recipientUserIds) {
      const recipient = await env.DB.prepare(
        'INSERT INTO notification_recipients (notification_schedule_id, user_id, created_at) VALUES (?, ?, ?) RETURNING notification_recipient_id'
      )
        .bind(
          created.notification_schedule_id,
          userId,
          '2026-09-24T09:00:00.000Z'
        )
        .first<{ notification_recipient_id: number }>();
      if (!recipient) throw new Error('Recipientを作成できませんでした');
      recipientIds.push(recipient.notification_recipient_id);
    }

    const deliveryStatuses: Array<[number, string]> = [
      [0, 'pending'],
      [1, 'retry_wait'],
      [1, 'stopped'],
      [3, 'sent'],
      [3, 'failed'],
    ];
    for (const [recipientIndex, status] of deliveryStatuses) {
      await env.DB.prepare(
        'INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status, attempt_count, created_at, updated_at) VALUES (?, NULL, 1, ?, 0, ?, ?)'
      )
        .bind(
          recipientIds[recipientIndex],
          status,
          '2026-09-24T09:00:00.000Z',
          '2026-09-24T09:00:00.000Z'
        )
        .run();
    }

    let audienceQueryCount = 0;
    const countedDb = new Proxy(env.DB, {
      get(target, property, receiver) {
        if (property === 'prepare') {
          return (query: string) => {
            if (query.includes('FROM notification_audiences na')) {
              audienceQueryCount += 1;
            }
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const detail = await createAdminNotificationQueryRepository(
      countedDb
    ).findById(created.notification_id);
    if (!detail) throw new Error('作成したNotification detailがありません');

    expect(detail.schedules).toHaveLength(2);
    expect(audienceQueryCount).toBe(1);
    expect(detail.creation).toMatchObject({
      method: 'automatic',
      source: {
        type: 'gathering',
        id: fixture.gatheringId,
        label: '通知Command集合場所',
      },
    });
    expect(detail.schedules[0]).toMatchObject({
      audience: {
        items: [
          {
            type: 'gathering',
            target_id: fixture.gatheringId,
            label: '通知Command集合場所',
          },
        ],
      },
      recipient_push_summary: {
        total_count: 4,
        success_count: 1,
        failed_count: 2,
        no_push_target_count: 1,
      },
    });

    await env.DB.prepare('DELETE FROM gatherings WHERE gathering_id = ?')
      .bind(fixture.gatheringId)
      .run();
    const afterSourceDelete = await repository.findById(
      created.notification_id
    );
    expect(afterSourceDelete?.creation).toMatchObject({
      source: { label: null },
    });
    expect(afterSourceDelete?.schedules[0]?.audience.items[0]).toMatchObject({
      label: null,
    });
  });

  it('一覧はsend_atの両端を含め、期間内Scheduleだけを返す', async () => {
    const fixture = await createFixture();
    const startBoundary = await commandRepository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    await env.DB.prepare(
      'UPDATE notification_schedules SET send_at = ? WHERE notification_schedule_id = ?'
    )
      .bind('2026-09-24T00:00:00+09:00', startBoundary.notification_schedule_id)
      .run();

    const mixed = await commandRepository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    await env.DB.prepare(
      "INSERT INTO notification_schedules (created_user_id, scheduled_by_user_id, notification_id, importance, send_status, send_at, created_at, updated_at) VALUES (?, ?, ?, 1, 'scheduled', ?, ?, ?)"
    )
      .bind(
        fixture.actorUserId,
        fixture.actorUserId,
        mixed.notification_id,
        '2026-09-25T00:00:00+09:00',
        '2026-09-24T09:00:00.000Z',
        '2026-09-24T09:00:00.000Z'
      )
      .run();

    const excluded = await commandRepository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    await env.DB.prepare(
      'UPDATE notification_schedules SET send_at = ? WHERE notification_schedule_id = ?'
    )
      .bind('2026-09-25T00:00:00+09:00', excluded.notification_schedule_id)
      .run();

    const batchSpy = vi.spyOn(env.DB, 'batch');
    try {
      const listed = await repository.findAll({
        from: '2026-09-24T00:00:00+09:00',
        to: '2026-09-24T23:59:59+09:00',
      });

      expect(listed.map(notification => notification.notification_id)).toEqual([
        mixed.notification_id,
        startBoundary.notification_id,
      ]);
      expect(listed[0]?.schedules).toHaveLength(1);
      expect(listed[0]?.schedules[0]?.send_at).toBe('2026-09-24T10:00:00.000Z');
      expect(listed[1]?.schedules[0]?.send_at).toBe(
        '2026-09-24T00:00:00+09:00'
      );
      expect(batchSpy).toHaveBeenCalledTimes(1);
      expect(batchSpy.mock.calls[0]?.[0]).toHaveLength(4);
    } finally {
      batchSpy.mockRestore();
    }
  });

  it('作成者とSchedule担当Userの削除後もnullで取得する', async () => {
    const fixture = await createFixture();
    const created = await commandRepository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );

    await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
      .bind(fixture.actorUserId)
      .run();

    await expect(
      repository.findById(created.notification_id)
    ).resolves.toMatchObject({
      creation: { method: 'manual', user: null },
      schedules: [{ scheduled_by: null }],
    });
  });
});
