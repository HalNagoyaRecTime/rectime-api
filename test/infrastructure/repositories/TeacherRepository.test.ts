import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createTeacherRepository } from '../../../src/infrastructure/repositories/TeacherRepository';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';

describe('TeacherRepository', () => {
  const repo: ITeacherRepository = createTeacherRepository(env.DB);

  describe('create', () => {
    it('教官を作成し、作成したエンティティを返す', async () => {
      const created = await repo.create({ displayName: '新規教官' });

      expect(created).toMatchObject({
        user_name: '新規教官',
      });
      expect(created.teacher_id).toEqual(expect.any(Number));
      expect(created.user_id).toEqual(expect.any(Number));
    });
  });

  describe('createMany', () => {
    it('複数の教官をまとめて作成する', async () => {
      const created = await repo.createMany([
        { displayName: '一括教官A' },
        { displayName: '一括教官B' },
      ]);

      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({ user_name: '一括教官A' });
      expect(created[1]).toMatchObject({ user_name: '一括教官B' });
      expect(created[0].teacher_id).not.toEqual(created[1].teacher_id);
      expect(created[0].user_id).not.toEqual(created[1].user_id);
    });

    it('空配列の場合は何も作成せず空配列を返す', async () => {
      const created = await repo.createMany([]);
      expect(created).toEqual([]);
    });
  });
});
