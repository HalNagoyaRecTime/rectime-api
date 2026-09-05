import { describe, expect, it, vi } from 'vitest';
import { createTeamService } from '../../../src/application/services/TeamService';
import type { ITeamRepository } from '../../../src/domain/interfaces/repositories/ITeamRepository';
import type { TeamEntity } from '../../../src/domain/entities/Team';

function buildTeam(overrides: Partial<TeamEntity> = {}): TeamEntity {
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

function createRepository(
  overrides: Partial<ITeamRepository> = {}
): ITeamRepository {
  return {
    findRanking: vi.fn(),
    findAllTeams: vi.fn(),
    findTeamById: vi.fn(),
    exists: vi.fn(),
    existsClassCodes: vi.fn(),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    addScore: vi.fn(),
    ...overrides,
  };
}

describe('TeamService', () => {
  describe('getAllTeams', () => {
    it('Entityをレスポンス用DTOへ変換し、既定値を渡す', async () => {
      const items = [buildTeam()];
      const repository = createRepository({
        findAllTeams: vi.fn().mockResolvedValue({ items, total: 1 }),
      });
      const service = createTeamService(repository);

      const result = await service.getAllTeams({});

      expect(result).toEqual({ items, total: 1, limit: 50, offset: 0 });
      expect(repository.findAllTeams).toHaveBeenCalledWith({
        search: undefined,
        limit: 50,
        offset: 0,
        sortBy: 'teamName',
        sortOrder: 'asc',
      });
    });

    it('指定したsearch/sortBy/sortOrderをそのままリポジトリへ渡す', async () => {
      const repository = createRepository({
        findAllTeams: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      });
      const service = createTeamService(repository);

      await service.getAllTeams({
        search: 'A組',
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });

      expect(repository.findAllTeams).toHaveBeenCalledWith({
        search: 'A組',
        limit: 50,
        offset: 0,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      });
    });
  });

  describe('getTeamById', () => {
    it('存在する場合はTeamDTOを返す', async () => {
      const team = buildTeam();
      const repository = createRepository({
        findTeamById: vi.fn().mockResolvedValue(team),
      });
      const service = createTeamService(repository);

      await expect(service.getTeamById(1)).resolves.toEqual(team);
      expect(repository.findTeamById).toHaveBeenCalledWith(1);
    });

    it('存在しない場合は例外を投げる', async () => {
      const repository = createRepository({
        findTeamById: vi.fn().mockResolvedValue(null),
      });
      const service = createTeamService(repository);

      await expect(service.getTeamById(999)).rejects.toThrow('Team not found');
    });
  });

  describe('createTeam', () => {
    it('class_codesが実在すればチームを作成する', async () => {
      const created = buildTeam();
      const repository = createRepository({
        existsClassCodes: vi.fn().mockResolvedValue(true),
        createTeam: vi.fn().mockResolvedValue(created),
      });
      const service = createTeamService(repository);

      await expect(
        service.createTeam({ team_name: 'テストチーム', class_codes: ['1A'] })
      ).resolves.toEqual(created);
      expect(repository.existsClassCodes).toHaveBeenCalledWith(['1A']);
    });

    it('存在しないclass_codesが含まれる場合は例外を投げ、createTeamを呼ばない', async () => {
      const repository = createRepository({
        existsClassCodes: vi.fn().mockResolvedValue(false),
      });
      const service = createTeamService(repository);

      await expect(
        service.createTeam({ team_name: 'テストチーム', class_codes: ['9Z'] })
      ).rejects.toThrow('Class not found');
      expect(repository.createTeam).not.toHaveBeenCalled();
    });

    it('class_codesが空配列なら存在確認をスキップする', async () => {
      const created = buildTeam({ registered_classes: [] });
      const repository = createRepository({
        createTeam: vi.fn().mockResolvedValue(created),
      });
      const service = createTeamService(repository);

      await service.createTeam({ team_name: 'テストチーム', class_codes: [] });

      expect(repository.existsClassCodes).not.toHaveBeenCalled();
    });
  });

  describe('updateTeam', () => {
    it('存在するチームならclass_codesを検証したうえで更新する', async () => {
      const updated = buildTeam({ team_name: '更新後チーム' });
      const repository = createRepository({
        existsClassCodes: vi.fn().mockResolvedValue(true),
        updateTeam: vi.fn().mockResolvedValue(updated),
      });
      const service = createTeamService(repository);

      await expect(
        service.updateTeam(1, {
          team_name: '更新後チーム',
          class_codes: ['1A'],
        })
      ).resolves.toEqual(updated);
    });

    it('存在しないチームの場合は例外を投げる', async () => {
      const repository = createRepository({
        existsClassCodes: vi.fn().mockResolvedValue(true),
        updateTeam: vi.fn().mockResolvedValue(null),
      });
      const service = createTeamService(repository);

      await expect(
        service.updateTeam(999, { team_name: '更新後チーム', class_codes: [] })
      ).rejects.toThrow('Team not found');
    });
  });
});
