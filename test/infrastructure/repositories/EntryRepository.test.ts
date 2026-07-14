import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEntryRepository } from '../../../src/infrastructure/repositories/EntryRepository';
import type { IEntryRepository } from '../../../src/domain/interfaces/repositories/IEntryRepository';

// 既知のバグ: t_entries / m_students は migrations/0003_update_student_schema.sql で
// DROP TABLE 済みで再作成されていないため、この repository は現状のスキーマに対して
// 常に "no such table: t_entries" で失敗する。EntryController/EntryService からも
// 到達可能な経路のため、実運用でもこのエラーが発生する。
// このテストは修正ではなく、現状の（壊れた）挙動を明文化するためのもの。
describe('EntryRepository', () => {
  let repo: IEntryRepository;

  beforeAll(() => {
    repo = createEntryRepository(env.DB);
  });

  describe('findAll', () => {
    it('t_entries テーブルが存在しないため D1_ERROR で失敗する', async () => {
      await expect(repo.findAll({})).rejects.toThrow(
        'no such table: t_entries'
      );
    });
  });

  describe('findById', () => {
    it('t_entries テーブルが存在しないため D1_ERROR で失敗する', async () => {
      await expect(repo.findById(1)).rejects.toThrow(
        'no such table: t_entries'
      );
    });
  });
});
