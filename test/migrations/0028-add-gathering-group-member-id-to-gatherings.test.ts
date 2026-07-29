import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

describe('0028_add_gathering_group_member_id_to_gatherings.sql', () => {
  let gatheringIds: number[] = [];
  let memberIds: number[] = [];
  let userIds: number[] = [];
  let eventIds: number[] = [];
  let gatheringSpotIds: number[] = [];

  afterEach(async () => {
    if (gatheringIds.length > 0) {
      await env.DB.batch(
        gatheringIds.map(id =>
          env.DB.prepare(
            'UPDATE gatherings SET gathering_group_member_id = NULL WHERE gathering_id = ?'
          ).bind(id)
        )
      );
    }
    if (memberIds.length > 0) {
      await env.DB.batch(
        memberIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_group_members WHERE gathering_group_member_id = ?'
          ).bind(id)
        )
      );
    }
    if (gatheringIds.length > 0) {
      await env.DB.batch(
        gatheringIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gatherings WHERE gathering_id = ?'
          ).bind(id)
        )
      );
    }
    if (userIds.length > 0) {
      await env.DB.batch(
        userIds.map(id =>
          env.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(id)
        )
      );
    }
    if (eventIds.length > 0) {
      await env.DB.batch(
        eventIds.map(id =>
          env.DB.prepare('DELETE FROM events WHERE event_id = ?').bind(id)
        )
      );
    }
    if (gatheringSpotIds.length > 0) {
      await env.DB.batch(
        gatheringSpotIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
          ).bind(id)
        )
      );
    }

    gatheringIds = [];
    memberIds = [];
    userIds = [];
    eventIds = [];
    gatheringSpotIds = [];
  });

  it('gatheringsに集合メンバーへの外部キーと一意制約を追加する', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(gatherings)'
    ).all<{ name: string }>();
    expect(columns.results).toContainEqual(
      expect.objectContaining({ name: 'gathering_group_member_id' })
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gatherings)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toContainEqual(
      expect.objectContaining({
        table: 'gathering_group_members',
        from: 'gathering_group_member_id',
        to: 'gathering_group_member_id',
      })
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(gatherings)'
    ).all<{ name: string; unique: number }>();
    expect(indexes.results).toContainEqual(
      expect.objectContaining({
        name: 'uq_gatherings_gathering_group_member_id',
        unique: 1,
      })
    );
  });

  it('存在する集合メンバーだけを参照でき、同じメンバーの重複参照を防ぐ', async () => {
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('0028参照確認競技', '体育館', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    eventIds.push(event!.event_id);

    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('0028参照確認場所') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();
    gatheringSpotIds.push(spot!.gathering_spot_id);

    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('0028参照確認利用者') RETURNING user_id"
    ).first<{ user_id: number }>();
    userIds.push(user!.user_id);

    const gatherings = await env.DB.batch<{ gathering_id: number }>([
      env.DB.prepare(
        'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
      ).bind(event!.event_id, spot!.gathering_spot_id),
      env.DB.prepare(
        'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
      ).bind(event!.event_id, spot!.gathering_spot_id),
    ]);
    const firstGatheringId = gatherings[0].results[0]!.gathering_id;
    const secondGatheringId = gatherings[1].results[0]!.gathering_id;
    gatheringIds.push(firstGatheringId, secondGatheringId);

    const member = await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?) RETURNING gathering_group_member_id'
    )
      .bind(firstGatheringId, user!.user_id)
      .first<{ gathering_group_member_id: number }>();
    memberIds.push(member!.gathering_group_member_id);

    await env.DB.prepare(
      'UPDATE gatherings SET gathering_group_member_id = ? WHERE gathering_id = ?'
    )
      .bind(member!.gathering_group_member_id, firstGatheringId)
      .run();

    await expect(
      env.DB.prepare(
        'UPDATE gatherings SET gathering_group_member_id = ? WHERE gathering_id = ?'
      )
        .bind(member!.gathering_group_member_id, secondGatheringId)
        .run()
    ).rejects.toThrow();

    await expect(
      env.DB.prepare(
        'UPDATE gatherings SET gathering_group_member_id = 999999 WHERE gathering_id = ?'
      )
        .bind(secondGatheringId)
        .run()
    ).rejects.toThrow();

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
