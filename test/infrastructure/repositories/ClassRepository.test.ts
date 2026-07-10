import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClassRepository } from '../../../src/infrastructure/repositories/ClassRepository';
import type { IClassRepository } from '../../../src/domain/interfaces/repositories/IClassRepository';
import { seedStudents, type SeededData } from '../../fixtures/students';

describe('ClassRepository', () => {
  let repo: IClassRepository;
  let seeded: SeededData;

  beforeAll(async () => {
    seeded = await seedStudents(env.DB);
    repo = createClassRepository(env.DB);
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
});
