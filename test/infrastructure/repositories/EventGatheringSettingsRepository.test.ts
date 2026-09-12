import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createEventGatheringSettingsRepository } from '../../../src/infrastructure/repositories/EventGatheringSettingsRepository';

describe('EventGatheringSettingsRepository', () => {
  const repository = createEventGatheringSettingsRepository(env.DB);
  let eventIds: number[] = [];
  let spotIds: number[] = [];
  let userIds: number[] = [];

  async function insertEvent(name: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO events (event_name, venue, start_time, end_time) VALUES (?, ?, ?, ?) RETURNING event_id'
    )
      .bind(name, '体育館', '0900', '1000')
      .first<{ event_id: number }>();
    eventIds.push(row!.event_id);
    return row!.event_id;
  }

  async function insertSpot(name: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO gathering_spots (gathering_spot_name) VALUES (?) RETURNING gathering_spot_id'
    )
      .bind(name)
      .first<{ gathering_spot_id: number }>();
    spotIds.push(row!.gathering_spot_id);
    return row!.gathering_spot_id;
  }

  async function insertGathering(
    eventId: number,
    spotId: number,
    round: number,
    time: string
  ): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id, round, gathering_time) VALUES (?, ?, ?, ?) RETURNING gathering_id'
    )
      .bind(eventId, spotId, round, time)
      .first<{ gathering_id: number }>();
    return row!.gathering_id;
  }

  async function insertMember(gatheringId: number): Promise<void> {
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('集合設定テスト') RETURNING user_id"
    ).first<{ user_id: number }>();
    userIds.push(user!.user_id);
    await env.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    )
      .bind(gatheringId, user!.user_id)
      .run();
  }

  async function readGatherings(eventId: number) {
    const { results } = await env.DB.prepare(
      'SELECT gathering_id, gathering_spot_id, round, gathering_time, updated_at FROM gatherings WHERE event_id = ? ORDER BY gathering_id'
    )
      .bind(eventId)
      .all<{
        gathering_id: number;
        gathering_spot_id: number;
        round: number;
        gathering_time: string;
        updated_at: string;
      }>();
    return results;
  }

  afterEach(async () => {
    // 参照している側から順に消す。テスト内で作った集合予定はEvent単位でまとめて消せる。
    if (userIds.length > 0) {
      await env.DB.batch(
        userIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_group_members WHERE user_id = ?'
          ).bind(id)
        )
      );
    }
    if (eventIds.length > 0) {
      await env.DB.batch(
        eventIds.flatMap(id => [
          env.DB.prepare('DELETE FROM gatherings WHERE event_id = ?').bind(id),
          env.DB.prepare('DELETE FROM events WHERE event_id = ?').bind(id),
        ])
      );
    }
    if (userIds.length > 0) {
      await env.DB.batch(
        userIds.map(id =>
          env.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(id)
        )
      );
    }
    if (spotIds.length > 0) {
      await env.DB.batch(
        spotIds.map(id =>
          env.DB.prepare(
            'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
          ).bind(id)
        )
      );
    }
    eventIds = [];
    spotIds = [];
    userIds = [];
  });

  describe('findByEventId', () => {
    it('集合予定が無いEventでは空配列を返す', async () => {
      const eventId = await insertEvent('空');

      await expect(repository.findByEventId(eventId)).resolves.toEqual([]);
    });

    it('round, gathering_time, gathering_id の順で返す', async () => {
      const eventId = await insertEvent('順序');
      const spotId = await insertSpot('順序場所');
      const round2 = await insertGathering(eventId, spotId, 2, '10:00');
      const round1Late = await insertGathering(eventId, spotId, 1, '10:30');
      const round1EarlyB = await insertGathering(eventId, spotId, 1, '10:00');
      const round1EarlyA = await insertGathering(eventId, spotId, 1, '10:00');

      const result = await repository.findByEventId(eventId);

      // 同時刻は gathering_id 昇順なので、後から作った round1EarlyA が後ろ
      expect(result.map(gathering => gathering.gathering_id)).toEqual([
        round1EarlyB,
        round1EarlyA,
        round1Late,
        round2,
      ]);
    });

    it('集合場所名と参加人数を一緒に返す', async () => {
      const eventId = await insertEvent('人数');
      const spotId = await insertSpot('出入口①');
      const withMembers = await insertGathering(eventId, spotId, 1, '10:00');
      const withoutMembers = await insertGathering(eventId, spotId, 1, '10:30');
      await insertMember(withMembers);
      await insertMember(withMembers);

      const result = await repository.findByEventId(eventId);

      expect(result).toEqual([
        {
          gathering_id: withMembers,
          round: 1,
          gathering_time: '10:00',
          gathering_spot_id: spotId,
          gathering_spot_name: '出入口①',
          member_count: 2,
        },
        {
          gathering_id: withoutMembers,
          round: 1,
          gathering_time: '10:30',
          gathering_spot_id: spotId,
          gathering_spot_name: '出入口①',
          member_count: 0,
        },
      ]);
    });

    it('他Eventの集合予定は含めない', async () => {
      const eventId = await insertEvent('対象');
      const otherEventId = await insertEvent('他');
      const spotId = await insertSpot('場所');
      const own = await insertGathering(eventId, spotId, 1, '10:00');
      await insertGathering(otherEventId, spotId, 1, '10:00');

      const result = await repository.findByEventId(eventId);

      expect(result.map(gathering => gathering.gathering_id)).toEqual([own]);
    });
  });

  describe('apply', () => {
    it('作成・更新・削除を1回でまとめて適用する', async () => {
      const eventId = await insertEvent('差分');
      const spotA = await insertSpot('場所A');
      const spotB = await insertSpot('場所B');
      const toUpdate = await insertGathering(eventId, spotA, 1, '10:00');
      const toDelete = await insertGathering(eventId, spotA, 1, '10:30');

      await repository.apply({
        event_id: eventId,
        creates: [
          { round: 2, gathering_time: '11:00', gathering_spot_id: spotB },
        ],
        updates: [
          {
            gathering_id: toUpdate,
            round: 1,
            gathering_time: '10:15',
            gathering_spot_id: spotB,
          },
        ],
        delete_ids: [toDelete],
      });

      const rows = await readGatherings(eventId);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({
        gathering_id: toUpdate,
        gathering_spot_id: spotB,
        round: 1,
        gathering_time: '10:15',
      });
      expect(rows[1]).toMatchObject({
        gathering_spot_id: spotB,
        round: 2,
        gathering_time: '11:00',
      });
      expect(rows[1].gathering_id).not.toBe(toDelete);
    });

    it('差分が空なら何もしない', async () => {
      const eventId = await insertEvent('空差分');
      const spotId = await insertSpot('場所');
      const gatheringId = await insertGathering(eventId, spotId, 1, '10:00');

      await repository.apply({
        event_id: eventId,
        creates: [],
        updates: [],
        delete_ids: [],
      });

      expect(await readGatherings(eventId)).toMatchObject([
        { gathering_id: gatheringId, round: 1, gathering_time: '10:00' },
      ]);
    });

    it('更新すると updated_at が進む', async () => {
      const eventId = await insertEvent('更新時刻');
      const spotId = await insertSpot('場所');
      const gatheringId = await insertGathering(eventId, spotId, 1, '10:00');
      await env.DB.prepare(
        "UPDATE gatherings SET updated_at = '2000-01-01 00:00:00' WHERE gathering_id = ?"
      )
        .bind(gatheringId)
        .run();

      await repository.apply({
        event_id: eventId,
        creates: [],
        updates: [
          {
            gathering_id: gatheringId,
            round: 1,
            gathering_time: '10:05',
            gathering_spot_id: spotId,
          },
        ],
        delete_ids: [],
      });

      const [row] = await readGatherings(eventId);
      expect(row.updated_at).not.toBe('2000-01-01 00:00:00');
    });

    // Application Service が他Eventの gathering_id を差分に入れない前提だが、
    // event_id の条件を外すと他Eventの行を書き換えられてしまうため、DB側でも固定する。
    it('他Eventの集合予定は更新も削除もしない', async () => {
      const eventId = await insertEvent('対象');
      const otherEventId = await insertEvent('他');
      const spotId = await insertSpot('場所');
      const otherGathering = await insertGathering(
        otherEventId,
        spotId,
        1,
        '10:00'
      );

      await repository.apply({
        event_id: eventId,
        creates: [],
        updates: [
          {
            gathering_id: otherGathering,
            round: 5,
            gathering_time: '12:00',
            gathering_spot_id: spotId,
          },
        ],
        delete_ids: [otherGathering],
      });

      expect(await readGatherings(otherEventId)).toMatchObject([
        { gathering_id: otherGathering, round: 1, gathering_time: '10:00' },
      ]);
    });

    // 事前確認をすり抜けて参加者付きの集合予定が削除対象に入っても、外部キー制約で
    // batch 全体が失敗する。参加者の紐付けが消えないこと、同じ batch の作成・更新も
    // 残らないことを固定する。
    it('参加者が残っている集合予定の削除は失敗し、同じbatchの変更も保存されない', async () => {
      const eventId = await insertEvent('参加者');
      const spotId = await insertSpot('場所');
      const inUse = await insertGathering(eventId, spotId, 1, '10:00');
      const toUpdate = await insertGathering(eventId, spotId, 1, '10:30');
      await insertMember(inUse);

      await expect(
        repository.apply({
          event_id: eventId,
          creates: [
            { round: 2, gathering_time: '11:00', gathering_spot_id: spotId },
          ],
          updates: [
            {
              gathering_id: toUpdate,
              round: 1,
              gathering_time: '10:45',
              gathering_spot_id: spotId,
            },
          ],
          delete_ids: [inUse],
        })
      ).rejects.toThrow('FOREIGN KEY constraint failed');

      expect(await readGatherings(eventId)).toMatchObject([
        { gathering_id: inUse, round: 1, gathering_time: '10:00' },
        { gathering_id: toUpdate, round: 1, gathering_time: '10:30' },
      ]);
      const member = await env.DB.prepare(
        'SELECT COUNT(*) AS n FROM gathering_group_members WHERE gathering_id = ?'
      )
        .bind(inUse)
        .first<{ n: number }>();
      expect(member?.n).toBe(1);
    });
  });
});
