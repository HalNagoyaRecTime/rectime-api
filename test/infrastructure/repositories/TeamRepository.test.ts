import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTeamRepository } from '../../../src/infrastructure/repositories/TeamRepository';
import type { ITeamRepository } from '../../../src/domain/interfaces/repositories/ITeamRepository';

// teams・team_scoresは chore/276-ranking-migration 側のマイグレーションで
// 追加される想定で、このブランチにはまだ取り込まれていない。
// マイグレーションがdevelop経由でこのブランチに入るまで、このファイルの
// テストはCIで失敗する（migrateされるまでの既知の状態）。
describe('TeamRepository', () => {
  let repo: ITeamRepository;

  beforeEach(async () => {
    await env.DB.prepare('DELETE FROM team_scores').run();
    await env.DB.prepare('DELETE FROM teams').run();
    repo = createTeamRepository(env.DB);
  });

  async function insertTeam(teamName: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO teams (team_name) VALUES (?) RETURNING team_id'
    )
      .bind(teamName)
      .first<{ team_id: number }>();
    return row!.team_id;
  }

  describe('findRanking', () => {
    it('得点降順に並べ、同点は同順位として次の順位を人数分繰り下げる', async () => {
      const teamA = await insertTeam('チームA');
      const teamB = await insertTeam('チームB');
      const teamC = await insertTeam('チームC');
      const teamD = await insertTeam('チームD');
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, ?), (?, ?), (?, ?)'
      )
        .bind(teamA, 30, teamB, 30, teamC, 10)
        .run();
      // teamDはteam_scores行を持たない(0点扱い)

      const result = await repo.findRanking({ limit: 50, offset: 0 });

      expect(result.total).toBe(4);
      expect(result.items).toEqual([
        { rank: 1, team_id: teamA, team_name: 'チームA', scores: 30 },
        { rank: 1, team_id: teamB, team_name: 'チームB', scores: 30 },
        { rank: 3, team_id: teamC, team_name: 'チームC', scores: 10 },
        { rank: 4, team_id: teamD, team_name: 'チームD', scores: 0 },
      ]);
    });

    it('limit・offsetでページ分けできる', async () => {
      const teamA = await insertTeam('チームA');
      const teamB = await insertTeam('チームB');
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, 30), (?, 10)'
      )
        .bind(teamA, teamB)
        .run();

      const result = await repo.findRanking({ limit: 1, offset: 1 });

      expect(result.total).toBe(2);
      expect(result.items).toEqual([
        { rank: 2, team_id: teamB, team_name: 'チームB', scores: 10 },
      ]);
    });
  });

  describe('findByIdWithScore', () => {
    it('team_scoresが無いチームは0点として返す', async () => {
      const teamId = await insertTeam('新規チーム');

      await expect(repo.findByIdWithScore(teamId)).resolves.toEqual({
        team_id: teamId,
        team_name: '新規チーム',
        scores: 0,
      });
    });

    it('存在しないチームはnullを返す', async () => {
      await expect(repo.findByIdWithScore(999999)).resolves.toBeNull();
    });
  });

  describe('exists', () => {
    it('存在するチームはtrueを返す', async () => {
      const teamId = await insertTeam('存在チーム');
      await expect(repo.exists(teamId)).resolves.toBe(true);
    });

    it('存在しないチームはfalseを返す', async () => {
      await expect(repo.exists(999999)).resolves.toBe(false);
    });
  });

  describe('addScore', () => {
    it('team_scoresが無いチームでも安全に加算できる(UPSERT)', async () => {
      const teamId = await insertTeam('採点対象');

      const result = await repo.addScore(teamId, 10);

      expect(result).toEqual({
        team_id: teamId,
        team_name: '採点対象',
        scores: 10,
      });
    });

    it('既存の得点に加算する', async () => {
      const teamId = await insertTeam('採点対象2');
      await repo.addScore(teamId, 10);

      const result = await repo.addScore(teamId, 5);

      expect(result.scores).toBe(15);
    });

    it('負の値を渡すと減算になる(訂正用途)', async () => {
      const teamId = await insertTeam('採点対象3');
      await repo.addScore(teamId, 10);

      const result = await repo.addScore(teamId, -3);

      expect(result.scores).toBe(7);
    });
  });
});
