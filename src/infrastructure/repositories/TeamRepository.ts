import type { D1Database } from '@cloudflare/workers-types';
import {
  buildProvisionalTeamName,
  type RankingEntryEntity,
  type RankingListOptions,
  type TeamEntity,
  type TeamListOptions,
  type TeamWriteInput,
} from '../../domain/entities/Team';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';
import { chunkArray } from './chunk';
import { buildCleanupEmptyTeamStatements } from './teamCleanup';

const D1_MAX_BOUND_PARAMETERS = 100;
const CLASS_CODE_CHUNK_SIZE = D1_MAX_BOUND_PARAMETERS - 1;

async function findTeamIdsByClassCodes(
  db: D1Database,
  classCodes: string[]
): Promise<Set<number>> {
  const teamIds = new Set<number>();
  for (const chunk of chunkArray(classCodes, D1_MAX_BOUND_PARAMETERS)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT DISTINCT team_id FROM class_rooms WHERE class_code IN (${placeholders})`
      )
      .bind(...chunk)
      .all<{ team_id: number }>();
    for (const row of result.results) teamIds.add(row.team_id);
  }
  return teamIds;
}

async function findClassRoomsOwnedByOtherTeam(
  db: D1Database,
  classCodes: string[],
  excludeTeamId?: number
): Promise<{ class_code: string; team_id: number; team_name: string }[]> {
  const conflicts: {
    class_code: string;
    team_id: number;
    team_name: string;
  }[] = [];
  for (const chunk of chunkArray(classCodes, CLASS_CODE_CHUNK_SIZE)) {
    const placeholders = chunk.map(() => '?').join(', ');
    const result = await db
      .prepare(
        `SELECT c.class_code, c.team_id, t.team_name
         FROM class_rooms c
         JOIN teams t ON t.team_id = c.team_id
         WHERE c.class_code IN (${placeholders})
         ${excludeTeamId !== undefined ? 'AND c.team_id != ?' : ''}
         AND (SELECT COUNT(*) FROM class_rooms WHERE team_id = c.team_id) > 1`
      )
      .bind(...chunk, ...(excludeTeamId !== undefined ? [excludeTeamId] : []))
      .all<{ class_code: string; team_id: number; team_name: string }>();
    conflicts.push(...result.results);
  }
  return conflicts;
}

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

  // PUTは完全な状態を送る動詞のため、team_idに紐づくが渡されたclass_codesに
  // 無いクラスは外す。class_rooms.team_idはNOT NULLで行き先が要るため、
  // 外れたクラスは(ClassRoomRepository.createの新規team作成と同じく)
  // 自分専用の単独編成へ戻す。
  async function detachRemovedClassRooms(
    teamId: number,
    keepCodes: string[]
  ): Promise<void> {
    const keepSet = new Set(keepCodes);
    const current = await db
      .prepare(
        `SELECT class_room_id, class_code, class_name FROM class_rooms WHERE team_id = ?`
      )
      .bind(teamId)
      .all<{ class_room_id: number; class_code: string; class_name: string }>();
    const removed = current.results.filter(row => !keepSet.has(row.class_code));

    for (const row of removed) {
      const provisionalName = buildProvisionalTeamName({
        className: row.class_name,
        classCode: row.class_code,
      });
      await db.batch([
        db
          .prepare('INSERT INTO teams (team_name) VALUES (?)')
          .bind(provisionalName),
        db
          .prepare(
            `UPDATE class_rooms
               SET team_id = (SELECT team_id FROM teams WHERE team_name = ?),
                   updated_at = CURRENT_TIMESTAMP
             WHERE class_room_id = ?`
          )
          .bind(provisionalName, row.class_room_id),
      ]);
    }
  }

  // 付け替え先のteamIdに寄せると同時に、移動元の編成が空になっていれば
  // 同じbatchの中で(ClassRoomRepositoryのbuildCleanupEmptyTeamStatementsと同条件で)
  // 掃除する。移動元をteamIdへ書き換えた後だと元のteam_idが辿れないため、
  // 書き換え前に控えておく。
  async function attachClassRooms(
    teamId: number,
    classCodes: string[]
  ): Promise<void> {
    if (classCodes.length === 0) return;

    const previousTeamIds = await findTeamIdsByClassCodes(db, classCodes);

    await db.batch([
      ...chunkArray(classCodes, CLASS_CODE_CHUNK_SIZE).map(chunk => {
        const placeholders = chunk.map(() => '?').join(', ');
        return db
          .prepare(
            `UPDATE class_rooms SET team_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE class_code IN (${placeholders})`
          )
          .bind(teamId, ...chunk);
      }),
      ...Array.from(previousTeamIds)
        .filter(id => id !== teamId)
        .flatMap(id => buildCleanupEmptyTeamStatements(db, id)),
    ]);
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
             ORDER BY ${column} ${direction}, t.team_id ASC
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
      const unique = Array.from(new Set(classCodes));
      let matched = 0;
      for (const chunk of chunkArray(unique, D1_MAX_BOUND_PARAMETERS)) {
        const placeholders = chunk.map(() => '?').join(', ');
        const row = await db
          .prepare(
            `SELECT COUNT(*) AS count FROM class_rooms WHERE class_code IN (${placeholders})`
          )
          .bind(...chunk)
          .first<{ count: number }>();
        matched += row?.count ?? 0;
      }
      return matched === unique.length;
    },

    async findClassRoomsOwnedByOtherTeam(
      classCodes: string[],
      excludeTeamId?: number
    ): Promise<{ class_code: string; team_id: number; team_name: string }[]> {
      if (classCodes.length === 0) return [];
      return findClassRoomsOwnedByOtherTeam(db, classCodes, excludeTeamId);
    },

    async createTeam(input: TeamWriteInput): Promise<TeamEntity> {
      if (input.class_codes.length === 0) {
        const created = await db
          .prepare('INSERT INTO teams (team_name) VALUES (?) RETURNING team_id')
          .bind(input.team_name)
          .first<{ team_id: number }>();
        if (!created) throw new Error('Failed to create team');

        const team = await fetchTeamById(created.team_id);
        if (!team) throw new Error('Failed to create team');
        return team;
      }

      const previousTeamIds = await findTeamIdsByClassCodes(
        db,
        input.class_codes
      );

      const [createResult] = await db.batch<{ team_id: number }>([
        db
          .prepare('INSERT INTO teams (team_name) VALUES (?) RETURNING team_id')
          .bind(input.team_name),
        ...chunkArray(input.class_codes, CLASS_CODE_CHUNK_SIZE).map(chunk => {
          const placeholders = chunk.map(() => '?').join(', ');
          return db
            .prepare(
              `UPDATE class_rooms
               SET team_id = (SELECT team_id FROM teams WHERE team_name = ?),
                   updated_at = CURRENT_TIMESTAMP
               WHERE class_code IN (${placeholders})`
            )
            .bind(input.team_name, ...chunk);
        }),
        ...Array.from(previousTeamIds).flatMap(id =>
          buildCleanupEmptyTeamStatements(db, id)
        ),
      ]);

      const created = createResult.results[0];
      if (!created) throw new Error('Failed to create team');

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

      await detachRemovedClassRooms(teamId, input.class_codes);
      await attachClassRooms(teamId, input.class_codes);

      return fetchTeamById(teamId);
    },

    async delete(teamId: number): Promise<boolean> {
      await detachRemovedClassRooms(teamId, []);
      const statements = buildCleanupEmptyTeamStatements(db, teamId);
      const results = await db.batch(statements);
      const teamDeleteResult = results[results.length - 1];
      return (teamDeleteResult.meta.changes ?? 0) > 0;
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
