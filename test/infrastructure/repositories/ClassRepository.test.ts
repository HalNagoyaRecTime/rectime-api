import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClassRepository } from '../../../src/infrastructure/repositories/ClassRepository';
import type { IClassRepository } from '../../../src/domain/interfaces/repositories/IClassRepository';
import * as schema from '../../../src/infrastructure/database/schema';
import {
  class_rooms,
  students,
  users,
} from '../../../src/infrastructure/database/schema';

describe('ClassRepository', () => {
  let repo: IClassRepository;
  let classRoomIds: number[];

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
    const inserted = await orm
      .insert(class_rooms)
      .values([
        { classCode: '12B', name: '2年Bクラス' },
        { classCode: '11A', name: '1年Aクラス' },
      ])
      .returning();
    classRoomIds = inserted.map(c => c.id);

    repo = createClassRepository(env.DB);
  });

  describe('findById', () => {
    it('class_room_id に一致するクラスを返す', async () => {
      const classRoom = await repo.findById(classRoomIds[0]);
      expect(classRoom).toMatchObject({
        f_class_room_id: classRoomIds[0],
        f_class_code: '12B',
        f_name: '2年Bクラス',
      });
    });

    it('一致するクラスがない場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });

  describe('findAll', () => {
    it('class_rooms を class_room_id 昇順で全件返す', async () => {
      const result = await repo.findAll();

      expect(result).toHaveLength(2);
      const ids = result.map(c => c.f_class_room_id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('各カラムを ClassEntity のフィールドにマッピングする', async () => {
      const result = await repo.findAll();

      expect(result[0]).toMatchObject({
        f_class_code: '12B',
        f_name: '2年Bクラス',
      });
      expect(result[1]).toMatchObject({
        f_class_code: '11A',
        f_name: '1年Aクラス',
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
        f_class_code: '13C',
        f_name: '3年Cクラス',
      });

      const found = await repo.findById(created.f_class_room_id);
      expect(found).toEqual(created);
    });
  });
});
