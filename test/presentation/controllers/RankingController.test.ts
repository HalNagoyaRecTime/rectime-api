import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createRankingController } from '../../../src/presentation/controllers/RankingController';
import type { IRankingService } from '../../../src/application/services/IRankingService';
import type { TeamDTO } from '../../../src/application/dto/RankingDTO';

function buildTeam(overrides: Partial<TeamDTO> = {}): TeamDTO {
  return {
    team_id: 1,
    team_name: 'テストチーム',
    registered_classes: [],
    scores: 10,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup() {
  const rankingService: IRankingService = {
    getRanking: vi.fn(),
    addTeamScore: vi.fn(),
  };
  const controller = createRankingController(rankingService);
  const app = new Hono();
  app.get('/ranking', c => controller.getRanking(c));
  app.patch('/teams/:teamId/score', c => controller.addTeamScore(c));
  return { app, rankingService };
}

describe('RankingController', () => {
  describe('getRanking', () => {
    it('クエリパラメータなしの場合、既定値をサービスへ渡す', async () => {
      const { app, rankingService } = setup();
      const items = [
        { rank: 1, team_id: 1, team_name: 'テストチーム', scores: 10 },
      ];
      (rankingService.getRanking as ReturnType<typeof vi.fn>).mockResolvedValue(
        { items, total: 1, limit: 50, offset: 0 }
      );

      const response = await app.request('/ranking');

      expect(rankingService.getRanking).toHaveBeenCalledWith({});
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items,
        total: 1,
        limit: 50,
        offset: 0,
      });
    });

    it('limit・offsetクエリを解析してサービスへ渡す', async () => {
      const { app, rankingService } = setup();
      (rankingService.getRanking as ReturnType<typeof vi.fn>).mockResolvedValue(
        { items: [], total: 0, limit: 10, offset: 5 }
      );

      await app.request('/ranking?limit=10&offset=5');

      expect(rankingService.getRanking).toHaveBeenCalledWith({
        limit: 10,
        offset: 5,
      });
    });

    it('limitが範囲外の場合は400を返す', async () => {
      const { app } = setup();

      const response = await app.request('/ranking?limit=101');

      expect(response.status).toBe(400);
      expect((await response.json()) as { error: { code: string } }).toEqual(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'INVALID_RANKING_LIST_QUERY',
          }),
        })
      );
    });
  });

  describe('addTeamScore', () => {
    it('得点を加算し、更新後のチームを返す', async () => {
      const { app, rankingService } = setup();
      const team = buildTeam({ scores: 20 });
      (
        rankingService.addTeamScore as ReturnType<typeof vi.fn>
      ).mockResolvedValue(team);

      const response = await app.request('/teams/1/score', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: 10 }),
      });

      expect(rankingService.addTeamScore).toHaveBeenCalledWith(1, {
        points: 10,
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(team);
    });

    it('pointsが数値でない場合は400を返す', async () => {
      const { app, rankingService } = setup();

      const response = await app.request('/teams/1/score', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: 'ten' }),
      });

      expect(response.status).toBe(400);
      expect(rankingService.addTeamScore).not.toHaveBeenCalled();
    });

    it('存在しないチームの場合は404を返す', async () => {
      const { app, rankingService } = setup();
      (
        rankingService.addTeamScore as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('Team not found'));

      const response = await app.request('/teams/999/score', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: 10 }),
      });

      expect(response.status).toBe(404);
    });
  });
});
