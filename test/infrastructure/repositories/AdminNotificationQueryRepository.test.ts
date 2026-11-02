import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createAdminNotificationQueryRepository } from '../../../src/infrastructure/repositories/AdminNotificationQueryRepository';
import { createAdminNotificationQueryService } from '../../../src/application/services/AdminNotificationQueryService';
import { createAdminNotificationQueryController } from '../../../src/presentation/controllers/AdminNotificationQueryController';
import type { Env } from '../../../src/lib/env';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';
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
      env.DB.prepare('DELETE FROM team_scores'),
      env.DB.prepare('DELETE FROM teams'),
      env.DB.prepare('DELETE FROM staffs'),
      env.DB.prepare('DELETE FROM teachers'),
      env.DB.prepare('DELETE FROM events'),
      env.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('ページ指定なしは51件すべて返し、指定時はページ単位で返す', async () => {
    const fixture = await createFixture();
    for (let index = 0; index < 51; index++) {
      await commandRepository.create(
        buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
      );
    }
    const range = {
      from: '0001-01-01T00:00:00.000Z',
      to: '9999-12-31T23:59:59.999Z',
    };
    const legacy = await repository.findAll(range);
    const first = await repository.findAll({ ...range, page: 1, limit: 50 });
    const second = await repository.findAll({ ...range, page: 2, limit: 50 });
    expect(legacy.items).toHaveLength(51);
    expect(first.items).toHaveLength(50);
    expect(second.items).toHaveLength(1);
    expect(
      [...first.items, ...second.items].map(item => item.notification_id)
    ).toEqual(legacy.items.map(item => item.notification_id));

    const service = createAdminNotificationQueryService(repository);
    const oldResponse = await service.getAdminNotifications(range);
    const firstResponse = await service.getAdminNotifications({
      ...range,
      page: 1,
      limit: 50,
    });
    const secondResponse = await service.getAdminNotifications({
      ...range,
      page: 2,
      limit: 50,
    });
    expect(Object.keys(oldResponse)).toEqual(['items']);
    expect(oldResponse.items).toHaveLength(51);
    expect(firstResponse.pagination?.totalCount).toBe(51);
    expect(
      [...firstResponse.items, ...secondResponse.items].map(
        item => item.notificationId
      )
    ).toEqual(oldResponse.items.map(item => item.notificationId));

    const oldest = legacy.items.at(-1);
    if (!oldest) throw new Error('通知がありません');
    await env.DB.prepare(
      "UPDATE notifications SET push_title = 'Éclair 2 needle' WHERE notification_id = ?"
    )
      .bind(oldest.notification_id)
      .run();
    await env.DB.prepare(
      "UPDATE notification_schedules SET send_status = 'failed', send_at = '2027-01-02T00:00:00.000Z' WHERE notification_id = ?"
    )
      .bind(oldest.notification_id)
      .run();
    const filtered = await repository.findAll({
      ...range,
      page: 1,
      limit: 50,
      search: 'needle',
      status: 'failed',
      creationMethod: 'manual',
      filterFrom: '2027-01-01T00:00:00.000Z',
      filterTo: '2027-01-31T23:59:59.999Z',
    });
    expect(filtered.pagination.totalCount).toBe(1);
    expect(filtered.items.map(item => item.notification_id)).toEqual([
      oldest.notification_id,
    ]);

    const sorted = await repository.findAll({
      ...range,
      page: 1,
      limit: 50,
      sortBy: 'title',
      sortDirection: 'asc',
      now: '2026-09-24T09:00:00.000Z',
    });
    expect(sorted.pagination.totalCount).toBe(51);
    expect(sorted.items[0]?.notification_id).toBe(oldest.notification_id);
    const another = legacy.items[0];
    if (!another) throw new Error('通知がありません');
    await env.DB.prepare(
      "UPDATE notifications SET push_title = 'Éclair 10' WHERE notification_id = ?"
    )
      .bind(another.notification_id)
      .run();
    const unicode = await repository.findAll({
      ...range,
      page: 1,
      limit: 50,
      search: 'éCLAIR',
      sortBy: 'title',
      sortDirection: 'asc',
      now: '2026-09-24T09:00:00.000Z',
    });
    expect(unicode.pagination.totalCount).toBe(2);
    expect(unicode.items.map(item => item.notification_id)).toEqual([
      oldest.notification_id,
      another.notification_id,
    ]);

    const controller = createAdminNotificationQueryController(service);
    const app = new Hono<{
      Bindings: Env;
      Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
    }>();
    app.get('/admin/notifications', c => controller.getAdminNotifications(c));
    const legacyHttpResponse = await app.request(
      `/admin/notifications?${new URLSearchParams(range).toString()}`,
      {},
      {} as Env
    );
    const legacyHttpBody = (await legacyHttpResponse.json()) as {
      items: unknown[];
    };
    expect(legacyHttpResponse.status).toBe(200);
    expect(Object.keys(legacyHttpBody)).toEqual(['items']);
    expect(legacyHttpBody.items).toHaveLength(51);
    const pagedParams = new URLSearchParams({
      ...range,
      page: '2',
      limit: '50',
    });
    const pagedHttpResponse = await app.request(
      `/admin/notifications?${pagedParams.toString()}`,
      {},
      {} as Env
    );
    const pagedHttpBody = (await pagedHttpResponse.json()) as {
      items: unknown[];
      pagination: { totalCount: number };
    };
    expect(pagedHttpResponse.status).toBe(200);
    expect(pagedHttpBody.items).toHaveLength(1);
    expect(pagedHttpBody.pagination.totalCount).toBe(51);
    const params = new URLSearchParams({
      ...range,
      page: '1',
      limit: '50',
      search: 'éCLAIR',
      sortBy: 'title',
      sortDirection: 'asc',
    });
    const httpResponse = await app.request(
      `/admin/notifications?${params.toString()}`,
      {},
      {} as Env
    );
    expect(httpResponse.status).toBe(200);
    const httpBody = (await httpResponse.json()) as {
      items: { notificationId: number }[];
      pagination: { totalCount: number };
    };
    expect(httpBody.pagination.totalCount).toBe(2);
    expect(httpBody.items.map(item => item.notificationId)).toEqual([
      oldest.notification_id,
      another.notification_id,
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

  it('対象、作成方法、配信状態と日時をページング前に判定し、各列で並べる', async () => {
    const fixture = await createFixture();
    const first = await commandRepository.create(
      buildCommand(fixture.actorUserId, [
        { type: 'class_room', target_id: fixture.classRoomId },
      ])
    );
    const second = await commandRepository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    const automatic = await commandRepository.create(
      buildCommand(fixture.actorUserId, [
        { type: 'gathering', target_id: fixture.gatheringId },
      ])
    );
    await env.DB.prepare(
      "UPDATE notifications SET source_type='gathering', source_id=?, source_hash='source-test' WHERE notification_id=?"
    )
      .bind(fixture.gatheringId, automatic.notification_id)
      .run();
    await env.DB.prepare(
      "UPDATE notification_schedules SET send_status='failed', send_at='2026-09-25T00:00:00.000Z' WHERE notification_schedule_id=?"
    )
      .bind(second.notification_schedule_id)
      .run();
    const range = {
      from: '0001-01-01T00:00:00.000Z',
      to: '9999-12-31T23:59:59.999Z',
      page: 1,
      limit: 50,
      now: '2026-09-24T00:00:00.000Z',
    };
    const audience = await repository.findAll({
      ...range,
      search: '通知Command 1組',
    });
    expect(audience.items.map(item => item.notification_id)).toEqual([
      first.notification_id,
    ]);
    const auto = await repository.findAll({
      ...range,
      creationMethod: 'automatic',
    });
    expect(auto.items.map(item => item.notification_id)).toEqual([
      automatic.notification_id,
    ]);
    const failed = await repository.findAll({
      ...range,
      status: 'failed',
      filterFrom: '2026-09-25T00:00:00.000Z',
      filterTo: '2026-09-25T23:59:59.999Z',
    });
    expect(failed.items.map(item => item.notification_id)).toEqual([
      second.notification_id,
    ]);
    const disjoint = await repository.findAll({
      ...range,
      status: 'failed',
      filterTo: '2026-09-24T23:59:59.999Z',
    });
    expect(disjoint.items).toEqual([]);
    for (const sortBy of [
      'notificationId',
      'title',
      'audience',
      'sendAt',
      'creator',
      'status',
    ] as const) {
      const page = await repository.findAll({
        ...range,
        limit: 2,
        sortBy,
        sortDirection: 'asc',
      });
      const next = await repository.findAll({
        ...range,
        page: 2,
        limit: 2,
        sortBy,
        sortDirection: 'asc',
      });
      expect(page.pagination.totalCount).toBe(3);
      expect(
        new Set(
          [...page.items, ...next.items].map(item => item.notification_id)
        ).size
      ).toBe(3);
    }
    const byStatus = await repository.findAll({
      ...range,
      sortBy: 'status',
      sortDirection: 'asc',
    });
    expect(byStatus.items[0]?.notification_id).toBe(second.notification_id);
    const byTime = await repository.findAll({
      ...range,
      sortBy: 'sendAt',
      sortDirection: 'desc',
    });
    expect(byTime.items[0]?.notification_id).toBe(second.notification_id);
    const byAudience = await repository.findAll({
      ...range,
      sortBy: 'audience',
      sortDirection: 'asc',
    });
    expect(byAudience.items[0]?.notification_id).toBe(second.notification_id);
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
      "INSERT INTO notification_schedules (scheduled_by_user_id, notification_id, send_status, send_at, created_at, updated_at) VALUES (?, ?, 'scheduled', ?, ?, ?) RETURNING notification_schedule_id"
    )
      .bind(
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
      "INSERT INTO notification_schedules (scheduled_by_user_id, notification_id, send_status, send_at, created_at, updated_at) VALUES (?, ?, 'scheduled', ?, ?, ?)"
    )
      .bind(
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

      expect(listed.items.map(n => n.notification_id)).toEqual([
        mixed.notification_id,
        startBoundary.notification_id,
      ]);
      expect(listed.items[0]?.schedules).toHaveLength(1);
      expect(listed.items[0]?.schedules[0]?.send_at).toBe(
        '2026-09-24T10:00:00.000Z'
      );
      expect(listed.items[1]?.schedules[0]?.send_at).toBe(
        '2026-09-24T00:00:00+09:00'
      );
      expect(batchSpy).toHaveBeenCalledTimes(1);
      expect(batchSpy.mock.calls[0]?.[0]).toHaveLength(4);
      expect(listed.pagination.totalCount).toBe(2);
      expect(listed.pagination.page).toBe(1);
      expect(listed.pagination.limit).toBe(2);
    } finally {
      batchSpy.mockRestore();
    }
  });

  it('一覧期間filterは上限のミリ秒境界を正しく判定する', async () => {
    const fixture = await createFixture();
    const createAt = async (sendAt: string) => {
      const created = await commandRepository.create(
        buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
      );
      await env.DB.prepare(
        'UPDATE notification_schedules SET send_at = ? WHERE notification_schedule_id = ?'
      )
        .bind(sendAt, created.notification_schedule_id)
        .run();
      return created;
    };

    const included = await createAt('2026-09-24T10:00:00.100Z');
    await createAt('2026-09-24T10:00:00.101Z');
    await createAt('2026-09-24T10:00:00.900Z');

    const listed = await repository.findAll({
      from: '2026-09-24T09:00:00.000Z',
      to: '2026-09-24T10:00:00.100Z',
    });

    expect(listed.items.map(n => n.notification_id)).toEqual([
      included.notification_id,
    ]);
  });

  it('一覧期間filterは下限のミリ秒境界を正しく判定する', async () => {
    const fixture = await createFixture();
    const createAt = async (sendAt: string) => {
      const created = await commandRepository.create(
        buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
      );
      await env.DB.prepare(
        'UPDATE notification_schedules SET send_at = ? WHERE notification_schedule_id = ?'
      )
        .bind(sendAt, created.notification_schedule_id)
        .run();
      return created;
    };

    await createAt('2026-09-24T10:00:00.100Z');
    await createAt('2026-09-24T10:00:00.899Z');
    const included = await createAt('2026-09-24T10:00:00.900Z');

    const listed = await repository.findAll({
      from: '2026-09-24T10:00:00.900Z',
      to: '2026-09-24T11:00:00.000Z',
    });

    expect(listed.items.map(n => n.notification_id)).toEqual([
      included.notification_id,
    ]);
  });

  it('Scheduleは同一秒内でもsend_atの小数秒順で返す', async () => {
    const fixture = await createFixture();
    const created = await commandRepository.create(
      buildCommand(fixture.actorUserId, [{ type: 'all', target_id: null }])
    );
    await env.DB.prepare(
      'UPDATE notification_schedules SET send_at = ? WHERE notification_schedule_id = ?'
    )
      .bind('2026-09-24T10:00:00.900Z', created.notification_schedule_id)
      .run();

    const earlierSchedule = await env.DB.prepare(
      "INSERT INTO notification_schedules (scheduled_by_user_id, notification_id, send_status, send_at, created_at, updated_at) VALUES (?, ?, 'scheduled', ?, ?, ?) RETURNING notification_schedule_id"
    )
      .bind(
        fixture.actorUserId,
        created.notification_id,
        '2026-09-24T10:00:00.100Z',
        '2026-09-24T09:00:00.000Z',
        '2026-09-24T09:00:00.000Z'
      )
      .first<{ notification_schedule_id: number }>();
    if (!earlierSchedule) throw new Error('追加Scheduleを作成できませんでした');

    const expectedScheduleIds = [
      earlierSchedule.notification_schedule_id,
      created.notification_schedule_id,
    ];

    const detail = await repository.findById(created.notification_id);
    expect(
      detail?.schedules.map(schedule => schedule.notification_schedule_id)
    ).toEqual(expectedScheduleIds);

    const listed = await repository.findAll({
      from: '2026-09-24T10:00:00.000Z',
      to: '2026-09-24T10:00:00.999Z',
    });
    expect(
      listed.items[0]?.schedules.map(s => s.notification_schedule_id)
    ).toEqual(expectedScheduleIds);
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
