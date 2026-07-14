import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClassRepository } from '../../../src/infrastructure/repositories/ClassRepository';
import type { IClassRepository } from '../../../src/domain/interfaces/repositories/IClassRepository';
import * as schema from '../../../src/infrastructure/database/schema';
import {
  class_rooms,
  student_description,
  users,
} from '../../../src/infrastructure/database/schema';
import { seedStudents, type SeededData } from '../../fixtures/students';

describe('ClassRepository', () => {
  let repo: IClassRepository;
  let seeded: SeededData;

  beforeAll(async () => {
    seeded = await seedStudents(env.DB);
    repo = createClassRepository(env.DB);
  });

  describe('findById', () => {
    it('class_room_id に一致するクラスを返す', async () => {
      const classRoom = await repo.findById(seeded.classRoomId);
      expect(classRoom).toMatchObject({
        f_class_room_id: seeded.classRoomId,
        f_class_code: seeded.classCode,
      });
    });

    it('一致するクラスがない場合は null を返す', async () => {
      expect(await repo.findById(999999)).toBeNull();
    });
  });

  describe('findAll', () => {
    it('登録済みのクラスを全件返す', async () => {
      const classes = await repo.findAll();
      expect(classes).toEqual([
        expect.objectContaining({
          f_class_room_id: seeded.classRoomId,
          f_class_code: seeded.classCode,
        }),
      ]);
    });

    describe('複数クラスが存在する場合', () => {
      beforeAll(async () => {
        const orm = drizzle(env.DB, { schema });
        // class_rooms は users から、users は student_description から参照されるため、
        // 参照される側を残したまま削除するとFK制約に違反する。子テーブルから順に削除する
        // （テストはストレージを他ファイルと共有するため、他ファイルが投入した行が残っている場合がある）
        await orm.delete(student_description);
        await orm.delete(users);
        await orm.delete(class_rooms);
        await orm
          .insert(class_rooms)
          .values([
            { classCode: '12B', name: '2年Bクラス' },
            { classCode: '11A', name: '1年Aクラス' },
          ])
          .returning();
      });

      it('class_room_id 昇順で全件返す', async () => {
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
  });
});
