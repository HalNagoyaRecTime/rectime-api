import type { D1Database } from '@cloudflare/workers-types';
import {
  type RankingEntryEntity,
  type RankingListOptions,
  type TeamEntity,
  type TeamListOptions,
  type TeamWriteInput,
} from '../../domain/entities/Team';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';
import { chunkArray } from './chunk';
import { buildCleanupEmptyTeamStatements } from './teamCleanup';
import {
  buildRecalculateTeamNameByTeamNameStatement,
  buildRecalculateTeamNameStatement,
} from './teamNaming';

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
  //
  // 新しい単独編成は、まだどのチーム名とも衝突しない一時名で作ってから
  // クラスを付け替え、最後に登録順の名前へ上書きする。外れるクラスのコード
  // そのものを名前にすると、同名の編成が既存データ上に残っている場合に
  // UNIQUE制約へ衝突する恐れがあるため。
  async function detachRemovedClassRooms(
    teamId: number,
    keepCodes: string[]
  ): Promise<void> {
    const keepSet = new Set(keepCodes);
    const current = await db
      .prepare(
        `SELECT class_room_id, class_code FROM class_rooms WHERE team_id = ?`
      )
      .bind(teamId)
      .all<{ class_room_id: number; class_code: string }>();
    const removed = current.results.filter(row => !keepSet.has(row.class_code));

    for (const row of removed) {
      const placeholderName = `__detaching_class_room_${row.class_room_id}__`;
      await db.batch([
        db
          .prepare('INSERT INTO teams (team_name) VALUES (?)')
          .bind(placeholderName),
        db
          .prepare(
            `UPDATE class_rooms
               SET team_id = (SELECT team_id FROM teams WHERE team_name = ?),
                   updated_at = CURRENT_TIMESTAMP
             WHERE class_room_id = ?`
          )
          .bind(placeholderName, row.class_room_id),
        buildRecalculateTeamNameByTeamNameStatement(db, placeholderName),
      ]);
    }
  }

  // 付け替え先のteamIdに寄せると同時に、移動元の編成が空になっていれば
  // 同じbatchの中で(ClassRoomRepositoryのbuildCleanupEmptyTeamStatementsと同条件で)
  // 掃除し、空にならず残った移動元の編成・付け替え先の編成はそれぞれ
  // class_room_idの登録順で名前を再計算する。移動元をteamIdへ書き換えた後だと
  // 元のteam_idが辿れないため、書き換え前に控えておく。
  //
  // 名前の再計算より先に空編成を削除するのは、付け替え先の新しい名前が
  // (たまたま)移動元の古い名前と一致する場合にUNIQUE制約へ衝突しないため
  // (移動元が空になった時点で、その行はもう存在しなくなる)。
  //
  // classCodesが空配列でもteamId自身の掃除・再計算は行う。updateTeamで
  // 全クラスを外された編成が、空のまま古い名前で残り続けないようにする。
  async function attachClassRooms(
    teamId: number,
    classCodes: string[]
  ): Promise<void> {
    const previousTeamIds =
      classCodes.length === 0
        ? new Set<number>()
        : await findTeamIdsByClassCodes(db, classCodes);
    const otherPreviousTeamIds = Array.from(previousTeamIds).filter(
      id => id !== teamId
    );

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
      ...otherPreviousTeamIds.flatMap(id =>
        buildCleanupEmptyTeamStatements(db, id)
      ),
      ...otherPreviousTeamIds.map(id =>
        buildRecalculateTeamNameStatement(db, id)
      ),
      ...buildCleanupEmptyTeamStatements(db, teamId),
      buildRecalculateTeamNameStatement(db, teamId),
    ]);
  }

  return {
    async findRanking(
      options: RankingListOptions
    ): Promise<{ items: RankingEntryEntity[]; total: number }> {
      const searchPattern = options.search ? `%${options.search}%` : null;

      const [rows, totalResult] = await Promise.all([
        db
          .prepare(
            `SELECT * FROM (
               SELECT
                 t.team_id,
                 t.team_name,
                 COALESCE(ts.scores, 0) AS scores,
                 RANK() OVER (
                   ORDER BY COALESCE(ts.scores, 0) DESC
                 ) AS rank
               FROM teams t
               LEFT JOIN team_scores ts ON ts.team_id = t.team_id
             ) ranked
             WHERE (? IS NULL OR ranked.team_name LIKE ?)
             ORDER BY rank ASC, team_id ASC
             LIMIT ? OFFSET ?`
          )
          .bind(searchPattern, searchPattern, options.limit, options.offset)
          .all<RankingRow>(),
        db
          .prepare(
            'SELECT COUNT(*) AS total FROM teams WHERE (? IS NULL OR team_name LIKE ?)'
          )
          .bind(searchPattern, searchPattern)
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
          .bind('')
          .first<{ team_id: number }>();
        if (!created) throw new Error('Failed to create team');

        const team = await fetchTeamById(created.team_id);
        if (!team) throw new Error('Failed to create team');
        return team;
      }

      // 新しいチームは、まだどの名前とも衝突しない一時名で作る。例えば
      // 単独クラス「1A」を単独チームとして登録し直す場合、求める名前は
      // 既存の暫定チーム「1A」と同じになるため、最初から確定名で作ると
      // UNIQUE制約へ衝突する。クラスの付け替え・移動元の後片付けまでを
      // 一時名のまま同じbatchで行い、最後に登録順の確定名へ上書きする
      // (空になった移動元の編成は、名前の上書きより先に削除されるため
      // 衝突しない)。team_idがまだ分からないため、一時名での逆引きを使う。
      const placeholderName = `__creating_team_${crypto.randomUUID()}__`;
      const previousTeamIds = await findTeamIdsByClassCodes(
        db,
        input.class_codes
      );

      const [createResult] = await db.batch<{ team_id: number }>([
        db
          .prepare('INSERT INTO teams (team_name) VALUES (?) RETURNING team_id')
          .bind(placeholderName),
        ...chunkArray(input.class_codes, CLASS_CODE_CHUNK_SIZE).map(chunk => {
          const placeholders = chunk.map(() => '?').join(', ');
          return db
            .prepare(
              `UPDATE class_rooms
               SET team_id = (SELECT team_id FROM teams WHERE team_name = ?),
                   updated_at = CURRENT_TIMESTAMP
               WHERE class_code IN (${placeholders})`
            )
            .bind(placeholderName, ...chunk);
        }),
        ...Array.from(previousTeamIds).flatMap(id =>
          buildCleanupEmptyTeamStatements(db, id)
        ),
        ...Array.from(previousTeamIds).map(id =>
          buildRecalculateTeamNameStatement(db, id)
        ),
        buildRecalculateTeamNameByTeamNameStatement(db, placeholderName),
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
      const existing = await db
        .prepare('SELECT team_id FROM teams WHERE team_id = ?')
        .bind(teamId)
        .first<{ team_id: number }>();
      if (!existing) return null;

      // detachRemovedClassRoomsが外すクラスを単独編成へ退避する際、その編成の
      // 名前は(登録順の計算上)外れるクラス自身のコードと一致しうる。自分がまだ
      // 改名されていないと、例えば単独チーム「1A」を「1B」に入れ替えるだけで
      // 自分の古い名前「1A」と退避先の新しい名前「1A」が衝突する。detach/attach
      // の前に自分の名前を一時的に退避しておく(deleteと同じ手法)。
      await db
        .prepare('UPDATE teams SET team_name = ? WHERE team_id = ?')
        .bind(`__updating_team_${teamId}__`, teamId)
        .run();

      // 名前はここで確定させない。リクエストのclass_codesの並び順ではなく、
      // attachClassRoomsがクラスを付け替えた後にDBの登録順(class_room_id)で
      // 再計算する。
      await detachRemovedClassRooms(teamId, input.class_codes);
      await attachClassRooms(teamId, input.class_codes);

      // attachClassRoomsの名前再計算は、計算結果が変わらない場合は
      // updated_atを進めない(無関係な更新での誤爆防止)。PUTはここまで到達
      // した時点で書き込み要求自体は処理済みのため、同じclass_codesを
      // 再送した場合でもupdated_atは進める。
      await db
        .prepare(
          'UPDATE teams SET updated_at = CURRENT_TIMESTAMP WHERE team_id = ?'
        )
        .bind(teamId)
        .run();

      return fetchTeamById(teamId);
    },

    async delete(teamId: number): Promise<boolean> {
      const existing = await db
        .prepare('SELECT team_id FROM teams WHERE team_id = ?')
        .bind(teamId)
        .first();
      if (!existing) return false;

      const deletingName = `__deleting_team_${crypto.randomUUID()}__`;
      // 得点の確認から単独編成への移動、削除までを同じbatchで確定する。
      // 一時名への変更に成功した場合だけ後続を実行し、失敗時は全体を戻す。
      // 所属クラスもbatch内で取得し、事前取得との間の所属変更を取りこぼさない。
      await db.batch([
        db
          .prepare(
            `UPDATE teams SET team_name = ?
             WHERE team_id = ?
               AND NOT EXISTS (
                 SELECT 1 FROM team_scores WHERE team_id = ? AND scores != 0
               )`
          )
          .bind(deletingName, teamId, teamId),
        db
          .prepare(
            `INSERT INTO teams (team_name)
             SELECT class_name || '(' || class_code || ')'
             FROM class_rooms
             WHERE team_id = ?
               AND EXISTS (SELECT 1 FROM teams WHERE team_id = ? AND team_name = ?)`
          )
          .bind(teamId, teamId, deletingName),
        db
          .prepare(
            `UPDATE class_rooms
             SET team_id = (
                   SELECT t.team_id FROM teams t
                   WHERE t.team_name = class_rooms.class_name || '(' || class_rooms.class_code || ')'
                 ),
                 updated_at = CURRENT_TIMESTAMP,
                 lock_version = lock_version + 1
             WHERE team_id = ?
               AND EXISTS (SELECT 1 FROM teams WHERE team_id = ? AND team_name = ?)`
          )
          .bind(teamId, teamId, deletingName),
        ...buildCleanupEmptyTeamStatements(db, teamId),
      ]);
      // buildCleanupEmptyTeamStatementsが返す文の数・順序に依存しないよう、
      // batch後に改めて存在を確認する(得点が残っていれば削除されず残る)。
      const row = await db
        .prepare('SELECT team_id FROM teams WHERE team_id = ?')
        .bind(teamId)
        .first();
      return row === null;
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
