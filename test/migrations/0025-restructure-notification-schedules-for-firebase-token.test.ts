import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0025_restructure_notification_schedules_for_firebase_token.sql', () => {
  it('user_id/gathering_group_idをcreated_user_id/firebase_token_idへ再構成する', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(notification_schedules)'
    ).all<{ name: string }>();
    const columnNames = columns.results.map(column => column.name);
    expect(columnNames).toEqual(
      expect.arrayContaining(['created_user_id', 'firebase_token_id'])
    );
    expect(columnNames).not.toEqual(
      expect.arrayContaining(['user_id', 'gathering_group_id'])
    );

    const foreignKeyErrors = await env.DB.prepare(
      'PRAGMA foreign_key_check'
    ).all();
    expect(foreignKeyErrors.results).toEqual([]);
  });
});
