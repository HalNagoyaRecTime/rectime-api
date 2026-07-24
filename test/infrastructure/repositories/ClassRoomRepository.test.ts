import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClassRoomRepository } from '../../../src/infrastructure/repositories/ClassRoomRepository';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';
import * as schema from '../../../src/infrastructure/database/schema';
import {
  class_rooms,
  students,
  users,
} from '../../../src/infrastructure/database/schema';

describe('ClassRoomRepository', () => {
  let repo: IClassRoomRepository;

  beforeAll(async () => {
    const orm = drizzle(env.DB, { schema });
    // class_rooms は students から、students は users から参照されるため、
    // 参照される側を残したまま削除するとFK制約に違反する。子テーブルから順に削除する
    // （テストはストレージを他ファイルと共有するため、他ファイルが投入した行が残っている場合がある）
    await env.DB.prepare('DELETE FROM gathering_group_members').run();
    await env.DB.prepare('DELETE FROM notification_schedules').run();
    await env.DB.prepare('DELETE FROM gatherings').run();
    await env.DB.prepare('DELETE FROM events').run();
    await orm.delete(students);
    await orm.delete(users);
    await orm.delete(class_rooms);
    await orm
      .insert(class_rooms)
      .values([
        { classCode: '12B', name: '2年Bクラス' },
        { classCode: '11A', name: '1年Aクラス' },
      ])
      .returning();

    repo = createClassRoomRepository(env.DB);
  });

  describe('findAll', () => {
    it('class_rooms を class_room_id 昇順で全件返す', async () => {
      const result = await repo.findAll();

      expect(result).toHaveLength(2);
      const ids = result.map(c => c.class_room_id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('各カラムを ClassRoomEntity のフィールドにマッピングする', async () => {
      const result = await repo.findAll();

      expect(result[0]).toMatchObject({
        class_code: '12B',
        class_name: '2年Bクラス',
      });
      expect(result[1]).toMatchObject({
        class_code: '11A',
        class_name: '1年Aクラス',
      });
    });
  });

  describe('create', () => {
    it('新しいクラスを作成し、作成したエンティティを返す', async () => {
      const created = await repo.create({
        classCode: '13C',
        name: '3年Cクラス',
      });

      expect(created).toMatchObject({
        class_code: '13C',
        class_name: '3年Cクラス',
      });

      const all = await repo.findAll();
      expect(all).toContainEqual(created);
    });
  });

  describe('createMany', () => {
    it('複数のクラスをまとめて作成する', async () => {
      const created = await repo.createMany([
        { classCode: '14D', name: '4年Dクラス' },
        { classCode: '14E', name: '4年Eクラス' },
      ]);

      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({
        class_code: '14D',
        class_name: '4年Dクラス',
      });
      expect(created[1]).toMatchObject({
        class_code: '14E',
        class_name: '4年Eクラス',
      });

      const all = await repo.findAll();
      expect(all).toContainEqual(created[0]);
      expect(all).toContainEqual(created[1]);
    });

    it('空配列の場合は何も作成せず空配列を返す', async () => {
      const before = await repo.findAll();

      const created = await repo.createMany([]);

      expect(created).toEqual([]);
      const after = await repo.findAll();
      expect(after).toHaveLength(before.length);
    });
  });
});
