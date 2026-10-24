import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0018_create_notification_schedules.sql', () => {
  it('通知予定テーブルの最終カラム、外部キー、検索用indexを保持し、旧送信ログを削除する', async () => {
    // user_id/gathering_group_id は0025で再構成され、旧通知列は0052で削除されている。
    const columns = await env.DB.prepare(
      'PRAGMA table_info(notification_schedules)'
    ).all<{ name: string; notnull: number; pk: number; dflt_value: string | null }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'notification_schedule_id', pk: 1 }),
        expect.objectContaining({ name: 'scheduled_by_user_id' }),
        expect.objectContaining({ name: 'notification_id', notnull: 1 }),
        // 現行の通知v2契約では、Schedule statusをDB defaultで補完しない。
        expect.objectContaining({ name: 'send_status', notnull: 1, dflt_value: null }),
        expect.objectContaining({ name: 'failed_reason' }),
        expect.objectContaining({ name: 'send_at', notnull: 1 }),
      ])
    );
    const columnNames = columns.results.map(column => column.name);
    for (const legacyColumn of [
      'created_user_id',
      'event_id',
      'firebase_token_id',
      'importance',
      'fcm_message_id',
    ]) {
      expect(columnNames).not.toContain(legacyColumn);
    }

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_schedules)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'users',
          from: 'scheduled_by_user_id',
          to: 'user_id',
        }),
        expect.objectContaining({
          table: 'notifications',
          from: 'notification_id',
          to: 'notification_id',
        }),
      ])
    );
    expect(foreignKeys.results).not.toContainEqual(
      expect.objectContaining({ table: 'events' })
    );
    expect(foreignKeys.results).not.toContainEqual(
      expect.objectContaining({ table: 'firebase_tokens' })
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(notification_schedules)'
    ).all<{ name: string }>();
    const indexNames = indexes.results.map(index => index.name);
    expect(indexNames).toEqual(
      expect.arrayContaining([
        'idx_notification_schedules_due',
        'idx_notification_schedules_notification_id',
      ])
    );
    expect(indexNames).not.toContain('idx_notification_schedules_event_id');
    expect(indexNames).not.toContain(
      'idx_notification_schedules_firebase_token_id'
    );

    const oldTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_send_logs'"
    ).first();
    expect(oldTable).toBeNull();
  });
});
