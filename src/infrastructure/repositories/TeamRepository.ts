import type { D1Database } from '@cloudflare/workers-types';
import type {
  RankingEntryEntity,
  RankingListOptions,
  TeamEntity,
  TeamListOptions,
  TeamWriteInput,
} from '../../domain/entities/Team';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';

type RankingRow = {
  team_id: number;
  team_name: string;
  scores: number;
  rank: number;
};

type TeamRow = {
  team_id: number;
  team_name: string;
  created_at: string;
  updated_at: string;
  scores: number;
  class_codes: string | null;
};

const CLASS_CODE_SEPARATOR = '||';

const TEAM_SELECT = `
  SELECT
    t.team_id,
    t.team_name,
    t.created_at,
    t.updated_at,
    COALESCE(ts.scores, 0) AS scores,
    GROUP_CONCAT(c.class_code, '${CLASS_CODE_SEPARATOR}') AS class_codes
  FROM teams t
  LEFT JOIN team_scores ts ON ts.team_id = t.team_id
  LEFT JOIN class_rooms c ON c.team_id = t.team_id
`;

const TEAM_SORT_COLUMNS: Record<TeamListOptions['sortBy'], string> = {
  teamName: 't.team_name',
  registeredAt: 't.created_at',
  updatedAt: 't.updated_at',
};

function toTeamEntity(row: TeamRow): TeamEntity {
  return {
    team_id: row.team_id,
    team_name: row.team_name,
    registered_classes: row.class_codes
      ? row.class_codes.split(CLASS_CODE_SEPARATOR)
      : [],
    scores: row.scores,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function createTeamRepository(db: D1Database): ITeamRepository {
  async function fetchTeamById(teamId: number): Promise<TeamEntity | null> {
    const row = await db
      .prepare(`${TEAM_SELECT} WHERE t.team_id = ? GROUP BY t.team_id`)
      .bind(teamId)
      .first<TeamRow>();
    return row ? toTeamEntity(row) : null;
  }

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

    async findAllTeams(
      options: TeamListOptions
    ): Promise<{ items: TeamEntity[]; total: number }> {
      const column = TEAM_SORT_COLUMNS[options.sortBy];
      const direction = options.sortOrder === 'desc' ? 'DESC' : 'ASC';
      const searchPattern = options.search ? `%${options.search}%` : null;

      const [rows, totalResult] = await Promise.all([
        db
          .prepare(
            `${TEAM_SELECT}
             WHERE (? IS NULL OR t.team_name LIKE ?)
             GROUP BY t.team_id
             ORDER BY ${column} ${direction}
             LIMIT ? OFFSET ?`
          )
          .bind(searchPattern, searchPattern, options.limit, options.offset)
          .all<TeamRow>(),
        db
          .prepare(
            'SELECT COUNT(*) AS total FROM teams WHERE (? IS NULL OR team_name LIKE ?)'
          )
          .bind(searchPattern, searchPattern)
          .first<{ total: number }>(),
      ]);

      return {
        items: rows.results.map(toTeamEntity),
        total: totalResult?.total ?? 0,
      };
    },

    findTeamById: fetchTeamById,

    async exists(teamId: number): Promise<boolean> {
      const row = await db
        .prepare('SELECT team_id FROM teams WHERE team_id = ?')
        .bind(teamId)
        .first();
      return row !== null;
    },

    async existsClassCodes(classCodes: string[]): Promise<boolean> {
      if (classCodes.length === 0) return true;
      const placeholders = classCodes.map(() => '?').join(', ');
      const row = await db
        .prepare(
          `SELECT COUNT(*) AS count FROM class_rooms WHERE class_code IN (${placeholders})`
        )
        .bind(...classCodes)
        .first<{ count: number }>();
      return (row?.count ?? 0) === new Set(classCodes).size;
    },

    async createTeam(input: TeamWriteInput): Promise<TeamEntity> {
      const created = await db
        .prepare('INSERT INTO teams (team_name) VALUES (?) RETURNING team_id')
        .bind(input.team_name)
        .first<{ team_id: number }>();
      if (!created) throw new Error('Failed to create team');

      if (input.class_codes.length > 0) {
        const placeholders = input.class_codes.map(() => '?').join(', ');
        await db
          .prepare(
            `UPDATE class_rooms SET team_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE class_code IN (${placeholders})`
          )
          .bind(created.team_id, ...input.class_codes)
          .run();
      }

      const team = await fetchTeamById(created.team_id);
      if (!team) throw new Error('Failed to create team');
      return team;
    },

    async updateTeam(
      teamId: number,
      input: TeamWriteInput
    ): Promise<TeamEntity | null> {
      const updated = await db
        .prepare(
          'UPDATE teams SET team_name = ?, updated_at = CURRENT_TIMESTAMP WHERE team_id = ? RETURNING team_id'
        )
        .bind(input.team_name, teamId)
        .first<{ team_id: number }>();
      if (!updated) return null;

      if (input.class_codes.length > 0) {
        const placeholders = input.class_codes.map(() => '?').join(', ');
        await db
          .prepare(
            `UPDATE class_rooms SET team_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE class_code IN (${placeholders})`
          )
          .bind(teamId, ...input.class_codes)
          .run();
      }

      return fetchTeamById(teamId);
    },

    async delete(teamId: number): Promise<boolean> {
      const result = await db
        .prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(teamId)
        .run();
      return (result.meta.changes ?? 0) > 0;
    },

    async addScore(teamId: number, points: number): Promise<TeamEntity> {
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

      const team = await fetchTeamById(teamId);
      if (!team) throw new Error('Failed to add team score');
      return team;
    },
  };
}
