import { insertClassRoomWithTeam } from '../../fixtures/classRooms';
import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createNotificationConfigRepository } from '../../../src/infrastructure/repositories/NotificationConfigRepository';

const repository = createNotificationConfigRepository(env.DB);

interface Fixture {
  activeStudentId: number;
  inactiveStudentId: number;
  deletedStudentId: number;
  gatheringMemberId: number;
  eventOnlyMemberId: number;
  teacherUserId: number;
  classRoomId: number;
  firstGatheringId: number;
  eventId: number;
}

async function insertUser(
  name: string,
  isLiveActive = 1,
  deletionStatus: 'active' | 'deletion_pending' | 'deleted' = 'active'
): Promise<number> {
  const row = await env.DB.prepare(
    'INSERT INTO users (user_name, is_live_active, deletion_status) VALUES (?, ?, ?) RETURNING user_id'
  )
    .bind(`AudienceCount-${name}`, isLiveActive, deletionStatus)
    .first<{ user_id: number }>();
  if (!row) throw new Error('Count用Userを作成できませんでした');
  return row.user_id;
}

async function createFixture(): Promise<Fixture> {
  const activeStudentId = await insertUser('active-student');
  const inactiveStudentId = await insertUser('inactive-student', 0);
  const deletedStudentId = await insertUser('deleted-student', 1, 'deleted');
  const gatheringMemberId = await insertUser('gathering-member');
  const eventOnlyMemberId = await insertUser('event-only-member');
  const teacherUserId = await insertUser('teacher');
  const classRoom = await insertClassRoomWithTeam(env.DB, {
    classCode: 'AC1',
    className: 'Count 1組',
  });
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, start_time, end_time) VALUES ('Count Event', '0900', '1000') RETURNING event_id"
  ).first<{ event_id: number }>();
  if (!classRoom || !event) {
    throw new Error('Count用ClassRoomまたはEventを作成できませんでした');
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, 1, 'AC-S001')`
    ).bind(activeStudentId, classRoom.classRoomId),
    env.DB.prepare(
      `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, 2, 'AC-S002')`
    ).bind(inactiveStudentId, classRoom.classRoomId),
    env.DB.prepare(
      `INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number)
       VALUES (?, ?, 3, 'AC-S003')`
    ).bind(deletedStudentId, classRoom.classRoomId),
    env.DB.prepare('INSERT INTO teachers (user_id, email) VALUES (?, ?)').bind(
      teacherUserId,
      'audience-count-teacher@example.com'
    ),
    env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('Count Spot 1')"
    ),
    env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('Count Spot 2')"
    ),
  ]);
  const spots = await env.DB.prepare(
    "SELECT gathering_spot_id FROM gathering_spots WHERE gathering_spot_name LIKE 'Count Spot %' ORDER BY gathering_spot_id"
  ).all<{ gathering_spot_id: number }>();
  const [firstSpot, secondSpot] = spots.results;
  if (!firstSpot || !secondSpot) {
    throw new Error('Count用GatheringSpotを作成できませんでした');
  }
  const firstGathering = await env.DB.prepare(
    "INSERT INTO gatherings (event_id, gathering_spot_id, round, gathering_time) VALUES (?, ?, 1, '08:50') RETURNING gathering_id"
  )
    .bind(event.event_id, firstSpot.gathering_spot_id)
    .first<{ gathering_id: number }>();
  const secondGathering = await env.DB.prepare(
    "INSERT INTO gatherings (event_id, gathering_spot_id, round, gathering_time) VALUES (?, ?, 2, '08:55') RETURNING gathering_id"
  )
    .bind(event.event_id, secondSpot.gathering_spot_id)
    .first<{ gathering_id: number }>();
  if (!firstGathering || !secondGathering) {
    throw new Error('Count用Gatheringを作成できませんでした');
  }
  const addMember = (gatheringId: number, userId: number) =>
    env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    ).bind(gatheringId, userId);
  await env.DB.batch([
    addMember(firstGathering.gathering_id, activeStudentId),
    addMember(firstGathering.gathering_id, inactiveStudentId),
    addMember(firstGathering.gathering_id, gatheringMemberId),
    // 同じEvent内の2つのGatheringに所属するUser
    addMember(secondGathering.gathering_id, gatheringMemberId),
    addMember(secondGathering.gathering_id, eventOnlyMemberId),
  ]);

  return {
    activeStudentId,
    inactiveStudentId,
    deletedStudentId,
    gatheringMemberId,
    eventOnlyMemberId,
    teacherUserId,
    classRoomId: classRoom.classRoomId,
    firstGatheringId: firstGathering.gathering_id,
    eventId: event.event_id,
  };
}

describe('NotificationConfigRepository', () => {
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

  describe('countAudienceUsers', () => {
    it('allはactive Userだけを数え、inactive・削除済みUserを除外する', async () => {
      await createFixture();

      // active-student, gathering-member, event-only-member, teacher
      await expect(
        repository.countAudienceUsers([{ type: 'all', target_id: null }])
      ).resolves.toBe(4);
    });

    it('class_roomは所属するactive生徒だけを数え、教師を含めない', async () => {
      const fixture = await createFixture();

      await expect(
        repository.countAudienceUsers([
          { type: 'class_room', target_id: fixture.classRoomId },
        ])
      ).resolves.toBe(1);
    });

    it('gatheringは所属するactive Userだけを数える', async () => {
      const fixture = await createFixture();

      await expect(
        repository.countAudienceUsers([
          { type: 'gathering', target_id: fixture.firstGatheringId },
        ])
      ).resolves.toBe(2);
    });

    it('eventは複数Gatheringに所属するUserを1人として数える', async () => {
      const fixture = await createFixture();

      await expect(
        repository.countAudienceUsers([
          { type: 'event', target_id: fixture.eventId },
        ])
      ).resolves.toBe(3);
    });

    it('userはactive Userなら1、inactive Userなら0を返す', async () => {
      const fixture = await createFixture();

      await expect(
        repository.countAudienceUsers([
          { type: 'user', target_id: fixture.activeStudentId },
        ])
      ).resolves.toBe(1);
      await expect(
        repository.countAudienceUsers([
          { type: 'user', target_id: fixture.inactiveStudentId },
        ])
      ).resolves.toBe(0);
    });

    it('複数Audience間の同一Userを重複排除する', async () => {
      const fixture = await createFixture();

      // class_room: active-student
      // event: active-student, gathering-member, event-only-member
      // user: gathering-member
      await expect(
        repository.countAudienceUsers([
          { type: 'class_room', target_id: fixture.classRoomId },
          { type: 'event', target_id: fixture.eventId },
          { type: 'user', target_id: fixture.gatheringMemberId },
        ])
      ).resolves.toBe(3);
    });

    it('Tokenの有無に依存せず、Token 0件のUserも数える', async () => {
      const fixture = await createFixture();
      await env.DB.batch([
        env.DB.prepare(
          "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 1, 'count-token-1')"
        ).bind(fixture.gatheringMemberId),
        env.DB.prepare(
          "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'count-token-2')"
        ).bind(fixture.gatheringMemberId),
      ]);

      // Token 2件のUserも1人、Token 0件のUserも1人として数える
      await expect(
        repository.countAudienceUsers([
          { type: 'gathering', target_id: fixture.firstGatheringId },
        ])
      ).resolves.toBe(2);
    });

    it('Audienceが空なら0を返す', async () => {
      await expect(repository.countAudienceUsers([])).resolves.toBe(0);
    });

    it('countしてもRecipient行を作成しない', async () => {
      await createFixture();

      await repository.countAudienceUsers([{ type: 'all', target_id: null }]);

      const row = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM notification_recipients'
      ).first<{ count: number }>();
      expect(row?.count).toBe(0);
    });
  });

  describe('areAudienceTargetsAvailable', () => {
    it('すべての対象が存在すればtrue、1件でも存在しなければfalseを返す', async () => {
      const fixture = await createFixture();

      await expect(
        repository.areAudienceTargetsAvailable([
          { type: 'all', target_id: null },
          { type: 'class_room', target_id: fixture.classRoomId },
          { type: 'event', target_id: fixture.eventId },
        ])
      ).resolves.toBe(true);
      await expect(
        repository.areAudienceTargetsAvailable([
          { type: 'event', target_id: fixture.eventId },
          { type: 'gathering', target_id: 999_999 },
        ])
      ).resolves.toBe(false);
    });
  });
});
