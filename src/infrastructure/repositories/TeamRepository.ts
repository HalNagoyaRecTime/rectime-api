import type { D1Database } from '@cloudflare/workers-types';
import type {
  RankingEntryEntity,
  RankingListOptions,
  TeamScoreEntity,
} from '../../domain/entities/Team';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';

type RankingRow = {
  team_id: number;
  team_name: string;
  scores: number;
  rank: number;
};

type TeamScoreRow = {
  team_id: number;
  team_name: string;
  scores: number;
};

export function createTeamRepository(db: D1Database): ITeamRepository {
  return {
    async findRanking(
      options: RankingListOptions
    ): Promise<{ items: RankingEntryEntity[]; total: number }> {
      const [rows, totalResult] = await Promise.all([
        db
          .prepare(
            `SELECT
               t.team_id,
               t.team_name,
               COALESCE(ts.scores, 0) AS scores,
               RANK() OVER (
                 ORDER BY COALESCE(ts.scores, 0) DESC
               ) AS rank
             FROM teams t
             LEFT JOIN team_scores ts ON ts.team_id = t.team_id
             ORDER BY scores DESC, t.team_id ASC
             LIMIT ? OFFSET ?`
          )
          .bind(options.limit, options.offset)
          .all<RankingRow>(),
        db
          .prepare('SELECT COUNT(*) AS total FROM teams')
          .first<{ total: number }>(),
      ]);

      return {
        items: rows.results.map(row => ({
          team_id: row.team_id,
          team_name: row.team_name,
          scores: row.scores,
          rank: row.rank,
        })),
        total: totalResult?.total ?? 0,
      };
    },

    async findByIdWithScore(teamId: number): Promise<TeamScoreEntity | null> {
      const row = await db
        .prepare(
          `SELECT t.team_id, t.team_name, COALESCE(ts.scores, 0) AS scores
           FROM teams t
           LEFT JOIN team_scores ts ON ts.team_id = t.team_id
           WHERE t.team_id = ?`
        )
        .bind(teamId)
        .first<TeamScoreRow>();
      return row ?? null;
    },

    async exists(teamId: number): Promise<boolean> {
      const row = await db
        .prepare('SELECT team_id FROM teams WHERE team_id = ?')
        .bind(teamId)
        .first();
      return row !== null;
    },

    async addScore(teamId: number, points: number): Promise<TeamScoreEntity> {
      await db
        .prepare(
          `INSERT INTO team_scores (team_id, scores)
           VALUES (?, ?)
           ON CONFLICT(team_id) DO UPDATE
             SET scores = team_scores.scores + excluded.scores,
                 updated_at = CURRENT_TIMESTAMP`
        )
        .bind(teamId, points)
        .run();

      const row = await db
        .prepare(
          `SELECT t.team_id, t.team_name, ts.scores
           FROM teams t
           JOIN team_scores ts ON ts.team_id = t.team_id
           WHERE t.team_id = ?`
        )
        .bind(teamId)
        .first<TeamScoreRow>();
      if (!row) throw new Error('Failed to add team score');
      return row;
    },
  };
}
