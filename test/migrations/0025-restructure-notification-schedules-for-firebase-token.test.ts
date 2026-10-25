import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0025_restructure_notification_schedules_for_firebase_token.sql', () => {
  it('再構成後の旧列を0052で削除した最終スキーマを保持する', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(notification_schedules)'
    ).all<{ name: string }>();
    const columnNames = columns.results.map(column => column.name);
    expect(columnNames).not.toContain('created_user_id');
    expect(columnNames).not.toContain('firebase_token_id');
    expect(columnNames).not.toContain('user_id');
    expect(columnNames).not.toContain('gathering_group_id');

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
