import { describe, expect, it, vi } from 'vitest';
import type { D1Database, D1Result } from '@cloudflare/workers-types';
import type { NotificationCreationCommand } from '../../../src/domain/entities/NotificationCreation';
import { createNotificationCreationRepository } from '../../../src/infrastructure/repositories/NotificationCreationRepository';

describe('NotificationCreationRepository SQL', () => {
  it('automatic ScheduleはTarget Schema列だけをINSERTする', async () => {
    const prepared: { sql: string }[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        const statement = {
          sql,
          bind: vi.fn(() => statement),
        };
        prepared.push(statement);
        return statement;
      }),
      batch: vi
        .fn()
        .mockResolvedValue([
          result({ notification_id: 1 }),
          result({ notification_schedule_id: 2 }),
          result({}),
        ]),
    } as unknown as D1Database;
    const repository = createNotificationCreationRepository(db);

    await repository.create(buildAutomaticCommand());

    const scheduleSql = prepared.find(statement =>
      statement.sql.includes('INSERT INTO notification_schedules')
    )?.sql;
    expect(scheduleSql).toContain('scheduled_by_user_id');
    expect(scheduleSql).toContain('notification_id');
    expect(scheduleSql).toContain('send_status');
    expect(scheduleSql).toContain('send_at');
    expect(scheduleSql).not.toMatch(
      /created_user_id|event_id|importance|firebase_token_id|failed_reason|fcm_message_id|is_firebase_active/
    );
  });
});

function result(row: Record<string, unknown>): D1Result {
  return {
    results: [row],
    success: true,
    meta: { last_row_id: 1, changes: 1 },
  } as D1Result;
}

function buildAutomaticCommand(): NotificationCreationCommand {
  return {
    created_by_user_id: null,
    scheduled_by_user_id: null,
    push_title: '集合時間のお知らせ',
    push_body: '集合時間は10:45です。',
    detail_title: '集合時間のお知らせ',
    detail_body: '集合時間は10:45です。',
    importance: 'normal',
    send_at: '2026-10-04T01:00:00.000Z',
    audiences: [{ type: 'gathering', target_id: 51 }],
    source: { type: 'gathering', id: 51, hash: 'hash-10-45' },
    now: '2026-10-04T01:00:00.000Z',
    legacy_schedule: null,
  };
}
