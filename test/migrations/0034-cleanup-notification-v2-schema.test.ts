import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0034_cleanup_notification_v2_schema.sql', () => {
  it('expand互換列を削除し、v2の通知スキーマだけを残す', async () => {
    const tableColumns = async (tableName: string) => {
      const result = await env.DB.prepare(`PRAGMA table_info(${tableName})`).all<{
        name: string;
      }>();
      return result.results.map(column => column.name);
    };

    expect(await tableColumns('firebase_tokens')).toEqual([
      'firebase_token_id',
      'user_id',
      'platform',
      'fcm_token',
      'last_seen_at',
      'created_at',
      'updated_at',
    ]);
    expect(await tableColumns('notifications')).toEqual([
      'notification_id',
      'created_by_user_id',
      'push_title',
      'push_body',
      'importance',
      'notification_type',
      'source_type',
      'source_id',
      'source_hash',
      'created_at',
      'updated_at',
    ]);
    expect(await tableColumns('notification_schedules')).toEqual([
      'notification_schedule_id',
      'scheduled_by_user_id',
      'notification_id',
      'send_status',
      'send_at',
      'recipients_resolved_at',
      'started_at',
      'completed_at',
      'stopped_at',
      'stopped_by_user_id',
      'reason',
      'created_at',
      'updated_at',
    ]);
  });

  it('通知履歴を参照する外部キーと重複防止インデックスを維持する', async () => {
    const indexes = await env.DB.prepare(
      'PRAGMA index_list(notification_push_deliveries)'
    ).all<{ name: string }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'uq_notification_push_deliveries_recipient_token',
        }),
        expect.objectContaining({
          name: 'idx_notification_push_deliveries_retry',
        }),
      ])
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_push_deliveries)'
    ).all<{ table: string; from: string; to: string; on_delete: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'firebase_tokens',
          from: 'firebase_token_id',
          to: 'firebase_token_id',
          on_delete: 'SET NULL',
        }),
        expect.objectContaining({
          table: 'notification_recipients',
          from: 'notification_recipient_id',
          to: 'notification_recipient_id',
          on_delete: 'CASCADE',
        }),
      ])
    );
  });

  it('send_statusに暗黙のDEFAULTを設定せず、Firebase tokenを重複登録できない', async () => {
    const scheduleColumns = await env.DB.prepare(
      'PRAGMA table_info(notification_schedules)'
    ).all<{ name: string; notnull: number; dflt_value: string | null }>();
    const sendStatus = scheduleColumns.results.find(
      column => column.name === 'send_status'
    );
    expect(sendStatus).toMatchObject({ notnull: 1, dflt_value: null });

    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('0034 migration test') RETURNING user_id"
    ).first<{ user_id: number }>();
    expect(user).toBeTruthy();

    await env.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, '0034-duplicate-token')"
    )
      .bind(user!.user_id)
      .run();
    await expect(
      env.DB.prepare(
        "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, '0034-duplicate-token')"
      )
        .bind(user!.user_id)
        .run()
    ).rejects.toThrow(/UNIQUE/);
  });
});
