import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0018_create_notification_schedules.sql', () => {
  it('通知予定テーブルのカラム、外部キー、検索用indexを作成し、旧送信ログを削除する', async () => {
    // user_id/gathering_group_id は migrations/0025 でそれぞれ
    // created_user_id への改名・firebase_token_id への置き換えが行われている。
    const columns = await env.DB.prepare(
      'PRAGMA table_info(notification_schedules)'
    ).all<{ name: string; notnull: number; pk: number; dflt_value: string | null }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'notification_send_schedule_id', pk: 1 }),
        expect.objectContaining({ name: 'created_user_id', notnull: 1 }),
        expect.objectContaining({ name: 'event_id', notnull: 1 }),
        expect.objectContaining({ name: 'firebase_token_id', notnull: 1 }),
        expect.objectContaining({ name: 'notification_id', notnull: 1 }),
        expect.objectContaining({ name: 'importance', notnull: 1, dflt_value: '2' }),
        expect.objectContaining({ name: 'send_status', notnull: 1, dflt_value: "'draft'" }),
        expect.objectContaining({ name: 'fcm_message_id' }),
        expect.objectContaining({ name: 'failed_reason' }),
        expect.objectContaining({ name: 'send_at', notnull: 1 }),
      ])
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(notification_schedules)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'users',
          from: 'created_user_id',
          to: 'user_id',
        }),
        expect.objectContaining({ table: 'events', from: 'event_id', to: 'event_id' }),
        expect.objectContaining({
          table: 'firebase_tokens',
          from: 'firebase_token_id',
          to: 'firebase_token_id',
        }),
        expect.objectContaining({
          table: 'notifications',
          from: 'notification_id',
          to: 'notification_id',
        }),
      ])
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(notification_schedules)'
    ).all<{ name: string }>();
    expect(indexes.results.map(index => index.name)).toEqual(
      expect.arrayContaining([
        'idx_notification_schedules_due',
        'idx_notification_schedules_event_id',
        'idx_notification_schedules_firebase_token_id',
      ])
    );

    const oldTable = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'notification_send_logs'"
    ).first();
    expect(oldTable).toBeNull();
  });
});
