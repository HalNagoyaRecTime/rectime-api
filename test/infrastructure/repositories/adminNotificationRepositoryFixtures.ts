import { env } from 'cloudflare:workers';
import type {
  CreateNotificationCommand,
  NotificationAudienceTarget,
} from '../../../src/domain/entities/AdminNotificationCommand';
import { insertClassRoomWithTeam } from '../../fixtures/classRooms';

export interface Fixture {
  actorUserId: number;
  classRoomId: number;
  gatheringId: number;
  eventId: number;
}

export async function createFixture(): Promise<Fixture> {
  const actor = await env.DB.prepare(
    "INSERT INTO users (user_name, is_live_active) VALUES ('通知Command管理者', 1) RETURNING user_id"
  ).first<{ user_id: number }>();
  const classRoom = await insertClassRoomWithTeam(env.DB, {
    classCode: 'NC1',
    className: '通知Command 1組',
  });
  const event = await env.DB.prepare(
    "INSERT INTO events (event_name, start_time, end_time) VALUES ('通知Command行事', '1000', '1100') RETURNING event_id"
  ).first<{ event_id: number }>();
  const spot = await env.DB.prepare(
    "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('通知Command集合場所') RETURNING gathering_spot_id"
  ).first<{ gathering_spot_id: number }>();
  if (!actor || !event || !spot) {
    throw new Error('通知Commandのfixture作成に失敗しました');
  }
  const gathering = await env.DB.prepare(
    'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
  )
    .bind(event.event_id, spot.gathering_spot_id)
    .first<{ gathering_id: number }>();
  if (!gathering) throw new Error('通知Command集合の作成に失敗しました');

  return {
    actorUserId: actor.user_id,
    classRoomId: classRoom.classRoomId,
    gatheringId: gathering.gathering_id,
    eventId: event.event_id,
  };
}

export function buildCommand(
  actorUserId: number,
  audiences: NotificationAudienceTarget[]
): CreateNotificationCommand {
  return {
    actor_user_id: actorUserId,
    push_title: 'Push title',
    push_body: 'Push body',
    detail_title: 'Detail title',
    detail_body: 'Detail body',
    importance: 'low',
    send_at: '2026-09-24T10:00:00.000Z',
    audiences,
    now: '2026-09-24T09:00:00.000Z',
  };
}
