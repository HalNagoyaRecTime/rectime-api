import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createTeamController } from '../../../src/presentation/controllers/TeamController';
import type { ITeamService } from '../../../src/application/services/ITeamService';
import type { TeamDTO } from '../../../src/application/dto/RankingDTO';

function buildTeam(overrides: Partial<TeamDTO> = {}): TeamDTO {
  return {
    team_id: 1,
    team_name: 'テストチーム',
    registered_classes: ['1A'],
    scores: 10,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function setup() {
  const teamService: ITeamService = {
    getAllTeams: vi.fn(),
    getTeamById: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
  };
  const controller = createTeamController(teamService);
  const app = new Hono();
  app.get('/teams', c => controller.getAllTeams(c));
  app.get('/teams/:teamId', c => controller.getTeamById(c));
  app.post('/teams', c => controller.createTeam(c));
  app.put('/teams/:teamId', c => controller.updateTeam(c));
  return { app, teamService };
}

describe('TeamController', () => {
  describe('getAllTeams', () => {
    it('クエリパラメータなしの場合、既定値をサービスへ渡す', async () => {
      const { app, teamService } = setup();
      const items = [buildTeam()];
      (teamService.getAllTeams as ReturnType<typeof vi.fn>).mockResolvedValue({
        items,
        total: 1,
        limit: 50,
        offset: 0,
      });

      const response = await app.request('/teams');

      expect(teamService.getAllTeams).toHaveBeenCalledWith({});
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        items,
        total: 1,
        limit: 50,
        offset: 0,
      });
    });

    it('search・sortBy・sortOrderクエリを解析してサービスへ渡す', async () => {
      const { app, teamService } = setup();
      (teamService.getAllTeams as ReturnType<typeof vi.fn>).mockResolvedValue({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      });

      await app.request(
        '/teams?search=A%E7%B5%84&sortBy=updatedAt&sortOrder=desc'
      );

      expect(teamService.getAllTeams).toHaveBeenCalledWith({
        search: 'A組',
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
    });

    it('sortByが不正な値の場合は400を返す', async () => {
      const { app } = setup();

      const response = await app.request('/teams?sortBy=invalid');

      expect(response.status).toBe(400);
    });
  });

  describe('getTeamById', () => {
    it('存在する場合はチームを返す', async () => {
      const { app, teamService } = setup();
      const team = buildTeam();
      (teamService.getTeamById as ReturnType<typeof vi.fn>).mockResolvedValue(
        team
      );

      const response = await app.request('/teams/1');

      expect(teamService.getTeamById).toHaveBeenCalledWith(1);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(team);
    });

    it('teamIdが不正な場合は400を返す', async () => {
      const { app, teamService } = setup();

      const response = await app.request('/teams/abc');

      expect(response.status).toBe(400);
      expect(teamService.getTeamById).not.toHaveBeenCalled();
    });

    it('存在しない場合は404を返す', async () => {
      const { app, teamService } = setup();
      (teamService.getTeamById as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Team not found')
      );

      const response = await app.request('/teams/999');

      expect(response.status).toBe(404);
    });
  });

  describe('createTeam', () => {
    it('チームを作成する', async () => {
      const { app, teamService } = setup();
      const team = buildTeam();
      (teamService.createTeam as ReturnType<typeof vi.fn>).mockResolvedValue(
        team
      );

      const response = await app.request('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: 'テストチーム',
          class_codes: ['1A'],
        }),
      });

      expect(teamService.createTeam).toHaveBeenCalledWith({
        team_name: 'テストチーム',
        class_codes: ['1A'],
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toEqual(team);
    });

    it('team_nameが空の場合は400を返す', async () => {
      const { app, teamService } = setup();

      const response = await app.request('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_name: '', class_codes: [] }),
      });

      expect(response.status).toBe(400);
      expect(teamService.createTeam).not.toHaveBeenCalled();
    });

    it('存在しないclass_codeを含む場合は404を返す', async () => {
      const { app, teamService } = setup();
      (teamService.createTeam as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Class not found')
      );

      const response = await app.request('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: 'テストチーム',
          class_codes: ['9Z'],
        }),
      });

      expect(response.status).toBe(404);
    });

    it('チーム名が重複する場合は409を返す', async () => {
      const { app, teamService } = setup();
      (teamService.createTeam as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('UNIQUE constraint failed: teams.team_name')
      );

      const response = await app.request('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_name: '既存チーム', class_codes: [] }),
      });

      expect(response.status).toBe(409);
    });
  });

  describe('updateTeam', () => {
    it('チームを更新する', async () => {
      const { app, teamService } = setup();
      const team = buildTeam({ team_name: '更新後チーム' });
      (teamService.updateTeam as ReturnType<typeof vi.fn>).mockResolvedValue(
        team
      );

      const response = await app.request('/teams/1', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_name: '更新後チーム',
          class_codes: ['1A'],
        }),
      });

      expect(teamService.updateTeam).toHaveBeenCalledWith(1, {
        team_name: '更新後チーム',
        class_codes: ['1A'],
      });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(team);
    });

    it('存在しないチームの場合は404を返す', async () => {
      const { app, teamService } = setup();
      (teamService.updateTeam as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Team not found')
      );

      const response = await app.request('/teams/999', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_name: '更新後チーム', class_codes: [] }),
      });

      expect(response.status).toBe(404);
    });
  });
});
