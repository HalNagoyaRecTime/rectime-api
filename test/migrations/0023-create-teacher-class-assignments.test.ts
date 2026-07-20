import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

describe('0023_create_teacher_class_assignments.sql', () => {
  it('教員と担当クラスの中間テーブルのカラム、外部キー、indexを作成する', async () => {
    const columns = await env.DB.prepare(
      'PRAGMA table_info(teacher_class_assignments)'
    ).all<{ name: string; notnull: number; pk: number }>();
    expect(columns.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'teacher_class_assignment_id',
          pk: 1,
        }),
        expect.objectContaining({ name: 'teacher_id', notnull: 1 }),
        expect.objectContaining({ name: 'class_room_id', notnull: 1 }),
      ])
    );

    const foreignKeys = await env.DB.prepare(
      'PRAGMA foreign_key_list(teacher_class_assignments)'
    ).all<{ table: string; from: string; to: string }>();
    expect(foreignKeys.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: 'teachers',
          from: 'teacher_id',
          to: 'teacher_id',
        }),
        expect.objectContaining({
          table: 'class_rooms',
          from: 'class_room_id',
          to: 'class_room_id',
        }),
      ])
    );

    const indexes = await env.DB.prepare(
      'PRAGMA index_list(teacher_class_assignments)'
    ).all<{ name: string; unique: number }>();
    expect(indexes.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'idx_teacher_class_assignments_class_room_id',
        }),
      ])
    );
  });
});
