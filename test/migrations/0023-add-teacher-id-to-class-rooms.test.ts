import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0023_add_teacher_id_to_class_rooms.sql', () => {
  it('class_rooms に teacher_id カラムと外部キー、indexを追加する', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(class_rooms)'
    ).all<{ name: string; notnull: number; pk: number }>();
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
    ).all<{ name: string; unique: number }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'idx_class_rooms_teacher_id',
          unique: 0,
        }),
      ])
    );
  });
});
