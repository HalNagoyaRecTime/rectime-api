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

    repo = createClassRepository(env.DB);
  });

  describe('findAll', () => {
    it('class_rooms を class_room_id 昇順で全件返す', async () => {
      const result = await repo.findAll(1, 20);

      expect(result.classes).toHaveLength(2);
      const ids = result.classes.map(c => c.class_room_id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('各カラムを ClassEntity のフィールドにマッピングする', async () => {
      const result = await repo.findAll(1, 20);

      expect(result.classes[0]).toMatchObject({
        class_code: '12B',
        name: '2年Bクラス',
      });
      expect(result.classes[1]).toMatchObject({
        class_code: '11A',
        name: '1年Aクラス',
      });
    });
  });
});
