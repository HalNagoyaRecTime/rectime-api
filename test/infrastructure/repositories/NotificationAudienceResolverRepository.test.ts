import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import type { NotificationAudienceTarget } from '../../../src/domain/entities/AdminNotificationCommand';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationAudienceResolverService } from '../../../src/application/services/NotificationAudienceResolverService';

const commandRepository = createAdminNotificationCommandRepository(env.DB);
const repository = createNotificationAudienceResolverRepository(env.DB);
const service = createNotificationAudienceResolverService(repository);
const NOW = '2026-09-24T12:00:00.000Z';

interface Fixture {
  actorUserId: number;
  activeStudentId: number;
  inactiveStudentId: number;
  activeGatheringMemberId: number;
  activeEventMemberId: number;
  teacherUserId: number;
  classRoomId: number;
  firstGatheringId: number;
  eventId: number;
}

async function insertUser(name: string, isLiveActive = 1): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, ?) RETURNING user_id'
  )
    .bind(`AudienceResolver-${name}`, isLiveActive)
    .first<{ user_id: number }>();
  if (!row) throw new Error('Resolver用Userを作成できませんでした');
  return row.user_id;
}

async function createFixture(): Promise<Fixture> {
  const actorUserId = await insertUser('actor');
  const activeStudentId = await insertUser('active-student');
  const inactiveStudentId = await insertUser('inactive-student', 0);
  const activeGatheringMemberId = await insertUser('active-gathering-member');
  const activeEventMemberId = await insertUser('active-event-member');
  const teacherUserId = await insertUser('teacher');
  const classRoom = await env.DB.prepare(
    "INSERT INTO class_rooms (class_code, class_name) VALUES ('AR1', 'Resolver 1組') RETURNING class_room_id"
  ).first<{ class_room_id: number }>();
  if (!classRoom) throw new Error('Resolver用ClassRoomを作成できませんでした');
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, 1, 'AR-S001')`
    ).bind(activeStudentId, classRoom.class_room_id),
    env.DB.prepare(
      `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, 2, 'AR-S002')`
    ).bind(inactiveStudentId, classRoom.class_room_id),
    env.DB.prepare('INSERT INTO teachers (user_id, email) VALUES (?, ?)').bind(
      teacherUserId,
      'audience-resolver-teacher@example.com'
    ),
  ]);
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, start_time, end_time) VALUES ('Resolver Event', '0900', '1000') RETURNING event_id"
  ).first<{ event_id: number }>();
  const spots = await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('Resolver Spot 1') RETURNING gathering_spot_id"
    ),
    env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('Resolver Spot 2') RETURNING gathering_spot_id"
    ),
  ]);
  if (!event || !spots[0]?.results[0] || !spots[1]?.results[0]) {
    throw new Error('Resolver用EventまたはGatheringSpotを作成できませんでした');
  }
  const firstSpotId = Number(
    (spots[0].results[0] as { gathering_spot_id: number }).gathering_spot_id
  );
  const secondSpotId = Number(
    (spots[1].results[0] as { gathering_spot_id: number }).gathering_spot_id
  );
  const gatherings = await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id, round, gathering_time) VALUES (?, ?, 1, ?) RETURNING gathering_id'
    ).bind(event.event_id, firstSpotId, '08:50'),
    env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id, round, gathering_time) VALUES (?, ?, 2, ?) RETURNING gathering_id'
    ).bind(event.event_id, secondSpotId, '08:55'),
  ]);
  if (!gatherings[0]?.results[0] || !gatherings[1]?.results[0]) {
    throw new Error('Resolver用Gatheringを作成できませんでした');
  }
  const firstGatheringId = Number(
    (gatherings[0].results[0] as { gathering_id: number }).gathering_id
  );
  const secondGatheringId = Number(
    (gatherings[1].results[0] as { gathering_id: number }).gathering_id
  );
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(firstGatheringId, activeStudentId),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(firstGatheringId, inactiveStudentId),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(firstGatheringId, activeGatheringMemberId),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(secondGatheringId, activeGatheringMemberId),
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(secondGatheringId, activeEventMemberId),
  ]);

  return {
    actorUserId,
    activeStudentId,
    inactiveStudentId,
    activeGatheringMemberId,
    activeEventMemberId,
    teacherUserId,
    classRoomId: classRoom.class_room_id,
    firstGatheringId,
    eventId: event.event_id,
  };
}

async function createSchedule(
  actorUserId: number,
  audiences: NotificationAudienceTarget[]
): Promise<{ notificationId: number; scheduleId: number }> {
  const result = await commandRepository.create({
    actor_user_id: actorUserId,
    push_title: 'Resolver push title',
    push_body: 'Resolver push body',
    detail_title: 'Resolver detail title',
    detail_body: 'Resolver detail body',
    importance: 'normal',
    send_at: '2026-09-23T12:00:00.000Z',
    audiences,
    now: '2026-09-23T11:00:00.000Z',
  });
  return {
    notificationId: result.notification_id,
    scheduleId: result.notification_schedule_id,
  };
}

async function recipientIds(scheduleId: number): Promise<number[]> {
  const rows = await env.DB.prepare(
    `SELECT user_id FROM notification_recipients
     WHERE notification_schedule_id = ? ORDER BY user_id`
  )
    .bind(scheduleId)
    .all<{ user_id: number }>();
  return rows.results.map(row => row.user_id);
}

describe('NotificationAudienceResolverRepository', () => {
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

  it('5種類を解決し、inactiveを除き、class_roomへ教師を含めない', async () => {
    const fixture = await createFixture();
    const schedules = [
      await createSchedule(fixture.actorUserId, [
        { type: 'all', target_id: null },
      ]),
      await createSchedule(fixture.actorUserId, [
        { type: 'class_room', target_id: fixture.classRoomId },
      ]),
      await createSchedule(fixture.actorUserId, [
        { type: 'gathering', target_id: fixture.firstGatheringId },
      ]),
      await createSchedule(fixture.actorUserId, [
        { type: 'event', target_id: fixture.eventId },
      ]),
      await createSchedule(fixture.actorUserId, [
        { type: 'user', target_id: fixture.activeEventMemberId },
      ]),
      await createSchedule(fixture.actorUserId, [
        { type: 'user', target_id: fixture.inactiveStudentId },
      ]),
      await createSchedule(fixture.actorUserId, [
        { type: 'gathering', target_id: fixture.firstGatheringId },
        { type: 'event', target_id: fixture.eventId },
      ]),
    ];

    const result = await service.resolveDueSchedules(new Date(NOW));

    expect(result.failed_schedule_ids).toEqual([]);
    expect(result.completed_schedules).toHaveLength(schedules.length);
    expect(await recipientIds(schedules[0].scheduleId)).toEqual(
      [
        fixture.actorUserId,
        fixture.activeStudentId,
        fixture.activeGatheringMemberId,
        fixture.activeEventMemberId,
        fixture.teacherUserId,
      ].sort((a, b) => a - b)
    );
    expect(await recipientIds(schedules[1].scheduleId)).toEqual([
      fixture.activeStudentId,
    ]);
    expect(await recipientIds(schedules[2].scheduleId)).toEqual(
      [fixture.activeStudentId, fixture.activeGatheringMemberId].sort(
        (a, b) => a - b
      )
    );
    expect(await recipientIds(schedules[3].scheduleId)).toEqual(
      [
        fixture.activeStudentId,
        fixture.activeGatheringMemberId,
        fixture.activeEventMemberId,
      ].sort((a, b) => a - b)
    );
    expect(await recipientIds(schedules[4].scheduleId)).toEqual([
      fixture.activeEventMemberId,
    ]);
    expect(await recipientIds(schedules[5].scheduleId)).toEqual([]);

    const overlap = result.completed_schedules.find(
      row => row.notification_schedule_id === schedules[6].scheduleId
    );
    expect(overlap?.recipient_count).toBe(3);
    expect(await recipientIds(schedules[6].scheduleId)).toHaveLength(3);
    for (const schedule of schedules) {
      const row = await env.DB.prepare(
        `SELECT send_status, started_at, recipients_resolved_at
         FROM notification_schedules WHERE notification_schedule_id = ?`
      )
        .bind(schedule.scheduleId)
        .first<{
          send_status: string;
          started_at: string | null;
          recipients_resolved_at: string | null;
        }>();
      expect(row).toMatchObject({ send_status: 'resolving' });
      expect(row?.started_at).not.toBeNull();
      expect(row?.recipients_resolved_at).not.toBeNull();
    }
    expect(fixture.inactiveStudentId).not.toBe(fixture.activeStudentId);
  });

  it('resolving scheduleの同時再実行でもRecipientと確定状態を壊さない', async () => {
    const fixture = await createFixture();
    const schedule = await createSchedule(fixture.actorUserId, [
      { type: 'all', target_id: null },
      { type: 'event', target_id: fixture.eventId },
    ]);
    expect(await repository.claimScheduled(schedule.scheduleId, NOW)).toBe(
      true
    );

    const results = await Promise.all([
      service.resolveDueSchedules(new Date(NOW)),
      service.resolveDueSchedules(new Date(NOW)),
    ]);

    expect(results.flatMap(result => result.failed_schedule_ids)).toEqual([]);
    expect(
      results
        .flatMap(result => result.completed_schedules)
        .filter(item => item.notification_schedule_id === schedule.scheduleId)
    ).toHaveLength(1);
    expect(await recipientIds(schedule.scheduleId)).toEqual(
      [
        fixture.actorUserId,
        fixture.activeStudentId,
        fixture.activeGatheringMemberId,
        fixture.activeEventMemberId,
        fixture.teacherUserId,
      ].sort((a, b) => a - b)
    );
    const state = await env.DB.prepare(
      `SELECT recipients_resolved_at,
              (SELECT COUNT(*) FROM notification_audiences a
               WHERE a.notification_schedule_id = s.notification_schedule_id
                 AND a.resolved_at IS NULL) AS unresolved_count
       FROM notification_schedules s
       WHERE s.notification_schedule_id = ?`
    )
      .bind(schedule.scheduleId)
      .first<{
        recipients_resolved_at: string | null;
        unresolved_count: number;
      }>();
    expect(state).toEqual({
      recipients_resolved_at: NOW,
      unresolved_count: 0,
    });
  });

  it('Recipient挿入が失敗するとAudience未resolvedのまま残して再開可能にする', async () => {
    const fixture = await createFixture();
    const schedule = await createSchedule(fixture.actorUserId, [
      { type: 'all', target_id: null },
    ]);
    await env.DB.prepare(
      `CREATE TRIGGER fail_resolver_recipient_insert
       BEFORE INSERT ON notification_recipients
       BEGIN SELECT RAISE(ABORT, 'resolver test failure'); END`
    ).run();

    try {
      const result = await service.resolveDueSchedules(new Date(NOW));
      expect(result.failed_schedule_ids).toEqual([schedule.scheduleId]);
      expect(result.completed_schedules).toEqual([]);
      const state = await env.DB.prepare(
        `SELECT s.send_status, s.recipients_resolved_at,
                a.resolved_at,
                (SELECT COUNT(*) FROM notification_recipients r
                 WHERE r.notification_schedule_id = s.notification_schedule_id) AS recipient_count
         FROM notification_schedules s
         JOIN notification_audiences a USING (notification_schedule_id)
         WHERE s.notification_schedule_id = ?`
      )
        .bind(schedule.scheduleId)
        .first<{
          send_status: string;
          recipients_resolved_at: string | null;
          resolved_at: string | null;
          recipient_count: number;
        }>();
      expect(state).toEqual({
        send_status: 'resolving',
        recipients_resolved_at: null,
        resolved_at: null,
        recipient_count: 0,
      });
    } finally {
      await env.DB.prepare(
        'DROP TRIGGER IF EXISTS fail_resolver_recipient_insert'
      ).run();
    }
  });

  it('恒久的なAudience不整合をfailedへ更新する', async () => {
    const fixture = await createFixture();
    const schedule = await createSchedule(fixture.actorUserId, [
      { type: 'all', target_id: null },
    ]);
    expect(await repository.claimScheduled(schedule.scheduleId, NOW)).toBe(
      true
    );
    await expect(
      repository.failSchedule(
        schedule.scheduleId,
        'Audience 2 に対象IDがありません',
        NOW
      )
    ).resolves.toBe(true);
    await expect(
      repository.failSchedule(schedule.scheduleId, '再更新', NOW)
    ).resolves.toBe(false);

    const state = await env.DB.prepare(
      `SELECT send_status, failed_reason, recipients_resolved_at
       FROM notification_schedules
       WHERE notification_schedule_id = ?`
    )
      .bind(schedule.scheduleId)
      .first<{
        send_status: string;
        failed_reason: string | null;
        recipients_resolved_at: string | null;
      }>();
    expect(state).toMatchObject({
      send_status: 'failed',
      failed_reason: 'Audience 2 に対象IDがありません',
      recipients_resolved_at: null,
    });
  });

  it('due scheduleを一度だけclaimし、未来のscheduleはclaimしない', async () => {
    const fixture = await createFixture();
    const due = await createSchedule(fixture.actorUserId, [
      { type: 'all', target_id: null },
    ]);
    const firstClaim = repository.claimScheduled(due.scheduleId, NOW);
    const secondClaim = repository.claimScheduled(due.scheduleId, NOW);
    await expect(Promise.all([firstClaim, secondClaim])).resolves.toEqual([
      true,
      false,
    ]);

    const futureNotification = await commandRepository.create({
      actor_user_id: fixture.actorUserId,
      push_title: 'Future push',
      push_body: 'Future body',
      detail_title: 'Future detail',
      detail_body: 'Future detail body',
      importance: 'normal',
      send_at: '2026-09-25T12:00:00.000Z',
      audiences: [{ type: 'all', target_id: null }],
      now: NOW,
    });
    await expect(
      repository.claimScheduled(
        futureNotification.notification_schedule_id,
        NOW
      )
    ).resolves.toBe(false);
    const future = await env.DB.prepare(
      `SELECT send_status FROM notification_schedules
       WHERE notification_schedule_id = ?`
    )
      .bind(futureNotification.notification_schedule_id)
      .first<{ send_status: string }>();
    expect(future?.send_status).toBe('scheduled');
  });

  it('resolvingを未解決Audienceから再開し、started_atを保って再実行可能にする', async () => {
    const fixture = await createFixture();
    const schedule = await createSchedule(fixture.actorUserId, [
      { type: 'all', target_id: null },
      { type: 'gathering', target_id: fixture.firstGatheringId },
    ]);
    const claimedAt = '2026-09-24T11:00:00.000Z';
    expect(
      await repository.claimScheduled(schedule.scheduleId, claimedAt)
    ).toBe(true);
    const audiences = await repository.findUnresolvedAudiences(
      schedule.scheduleId
    );
    await repository.resolveAudience(
      schedule.scheduleId,
      audiences[0],
      claimedAt
    );

    const resumed = await service.resolveDueSchedules(new Date(NOW));

    expect(resumed.failed_schedule_ids).toEqual([]);
    expect(resumed.completed_schedules).toEqual([
      { notification_schedule_id: schedule.scheduleId, recipient_count: 5 },
    ]);
    const state = await env.DB.prepare(
      `SELECT started_at, recipients_resolved_at
       FROM notification_schedules WHERE notification_schedule_id = ?`
    )
      .bind(schedule.scheduleId)
      .first<{ started_at: string; recipients_resolved_at: string | null }>();
    expect(state?.started_at).toBe(claimedAt);
    expect(state?.recipients_resolved_at).toBe(NOW);
    expect(await recipientIds(schedule.scheduleId)).toHaveLength(5);

    await expect(
      service.resolveDueSchedules(new Date('2026-09-24T12:01:00.000Z'))
    ).resolves.toEqual({ completed_schedules: [], failed_schedule_ids: [] });
    expect(await recipientIds(schedule.scheduleId)).toHaveLength(5);
  });
});
