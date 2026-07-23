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
});
