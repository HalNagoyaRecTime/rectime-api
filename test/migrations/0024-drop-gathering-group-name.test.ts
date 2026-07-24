import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0024_drop_gathering_group_name.sql', () => {
  it('名称を削除し、IDと監査日時だけを保持する', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(gathering_groups)'
    ).all<{ name: string; notnull: number; pk: number }>();

    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'gathering_group_id', pk: 1 }),
        expect.objectContaining({ name: 'created_at', notnull: 1 }),
        expect.objectContaining({ name: 'updated_at', notnull: 1 }),
      ])
    );
    expect(columns.results.map(column => column.name)).not.toContain(
      'gathering_group_name'
    );
    expect(columns.results.map(column => column.name)).not.toContain('user_id');
  });

  it('所属・集合からgathering_groupsへの外部キー参照を保持する', async () => {
    const memberForeignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gathering_group_members)'
    ).all<{ table: string; from: string; to: string }>();
    const gatheringForeignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(gatherings)'
    ).all<{ table: string; from: string; to: string }>();

    expect(memberForeignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'gathering_groups',
          from: 'gathering_group_id',
          to: 'gathering_group_id',
        }),
      ])
    );
    expect(gatheringForeignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'gathering_groups',
          from: 'gathering_group_id',
          to: 'gathering_group_id',
        }),
      ])
    );
  });

  it('グループに所属・集合データを紐づけても外部キー整合性を保つ', async () => {
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('0024移行確認') RETURNING user_id"
    ).first<{ user_id: number }>();
    const group = await env.DB.prepare(
      'INSERT INTO gathering_groups DEFAULT VALUES RETURNING gathering_group_id'
    ).first<{ gathering_group_id: number }>();
    const event = await env.DB.prepare(
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('0024確認競技', '体育館', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    const spot = await env.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('0024確認場所') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();

    try {
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO gathering_group_members (gathering_group_id, user_id) VALUES (?, ?)'
        ).bind(group!.gathering_group_id, user!.user_id),
        env.DB.prepare(
          'INSERT INTO gatherings (gathering_group_id, event_id, gathering_spot_id) VALUES (?, ?, ?)'
        ).bind(
          group!.gathering_group_id,
          event!.event_id,
          spot!.gathering_spot_id
        ),
      ]);

      const foreignKeyErrors = await env.DB.prepare(
        'PRAGMA foreign_key_check'
      ).all();
      expect(foreignKeyErrors.results).toEqual([]);
    } finally {
      await env.DB.prepare(
        'DELETE FROM gathering_group_members WHERE gathering_group_id = ?'
      )
        .bind(group!.gathering_group_id)
        .run();
      await env.DB.prepare(
        'DELETE FROM gatherings WHERE gathering_group_id = ?'
      )
        .bind(group!.gathering_group_id)
        .run();
      await env.DB.prepare(
        'DELETE FROM gathering_groups WHERE gathering_group_id = ?'
      )
        .bind(group!.gathering_group_id)
        .run();
      await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
        .bind(event!.event_id)
        .run();
      await env.DB.prepare(
        'DELETE FROM gathering_spots WHERE gathering_spot_id = ?'
      )
        .bind(spot!.gathering_spot_id)
        .run();
      await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
        .bind(user!.user_id)
        .run();
    }
  });
});
