import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0023_add_class_rooms_teacher_id.sql', () => {
  it('class_roomsにteacher_id（NULL許容のteachers外部キー）とindexを追加する', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(class_rooms)'
    ).all<{ name: string; notnull: number }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'teacher_id', notnull: 0 }),
      ])
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(class_rooms)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'teachers',
          from: 'teacher_id',
          to: 'teacher_id',
        }),
      ])
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(class_rooms)'
    ).all<{ name: string }>();
    expect(indexes.results.map(index => index.name)).toEqual(
      expect.arrayContaining(['idx_class_rooms_teacher_id'])
    );
  });
});
