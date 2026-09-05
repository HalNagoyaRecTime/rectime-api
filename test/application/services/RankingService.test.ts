import { describe, expect, it, vi } from 'vitest';
import { createRankingService } from '../../../src/application/services/RankingService';
import type { ITeamRepository } from '../../../src/domain/interfaces/repositories/ITeamRepository';
import type {
  RankingEntryEntity,
  TeamEntity,
} from '../../../src/domain/entities/Team';

function buildRankingEntry(
  overrides: Partial<RankingEntryEntity> = {}
): RankingEntryEntity {
  return {
    rank: 1,
    team_id: 1,
    team_name: 'テストチーム',
    scores: 10,
    ...overrides,
  };
}

function buildTeam(overrides: Partial<TeamEntity> = {}): TeamEntity {
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

describe('RankingService', () => {
  describe('getRanking', () => {
    it('Entityをレスポンス用DTOへ変換し、既定のページング値を返す', async () => {
      const items = [buildRankingEntry()];
      const repository = createRepository({
        findRanking: vi.fn().mockResolvedValue({ items, total: 1 }),
      });
      const service = createRankingService(repository);

      const result = await service.getRanking({});

      expect(result).toEqual({ items, total: 1, limit: 50, offset: 0 });
      expect(repository.findRanking).toHaveBeenCalledWith({
        limit: 50,
        offset: 0,
      });
    });

    it('指定したlimit/offsetをそのままリポジトリへ渡す', async () => {
      const repository = createRepository({
        findRanking: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      });
      const service = createRankingService(repository);

      await service.getRanking({ limit: 10, offset: 20 });

      expect(repository.findRanking).toHaveBeenCalledWith({
        limit: 10,
        offset: 20,
      });
    });
  });

  describe('addTeamScore', () => {
    it('存在するチームなら得点を加算し、更新後のTeamDTOを返す', async () => {
      const updated = buildTeam({ scores: 20 });
      const repository = createRepository({
        exists: vi.fn().mockResolvedValue(true),
        addScore: vi.fn().mockResolvedValue(updated),
      });
      const service = createRankingService(repository);

      await expect(service.addTeamScore(1, { points: 10 })).resolves.toEqual(
        updated
      );
      expect(repository.exists).toHaveBeenCalledWith(1);
      expect(repository.addScore).toHaveBeenCalledWith(1, 10);
    });

    it('存在しないチームの場合は例外を投げ、addScoreを呼ばない', async () => {
      const repository = createRepository({
        exists: vi.fn().mockResolvedValue(false),
      });
      const service = createRankingService(repository);

      await expect(service.addTeamScore(999, { points: 10 })).rejects.toThrow(
        'Team not found'
      );
      expect(repository.addScore).not.toHaveBeenCalled();
    });
  });
});
