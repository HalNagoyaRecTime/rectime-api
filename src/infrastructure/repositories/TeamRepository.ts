import type { D1Database } from '@cloudflare/workers-types';
import type { TeamEntity } from '../../domain/entities/Team';
import type { ITeamRepository } from '../../domain/interfaces/repositories/ITeamRepository';

export function createTeamRepository(db: D1Database): ITeamRepository {
  return {
    async create(teamName: string): Promise<TeamEntity> {
      const row = await db
        .prepare(
          'INSERT INTO teams (team_name) VALUES (?) RETURNING team_id, team_name'
        )
        .bind(teamName)
        .first<TeamEntity>();
      if (!row) throw new Error('Failed to create team');
      return row;
    },

    async exists(id: number): Promise<boolean> {
      const row = await db
        .prepare('SELECT team_id FROM teams WHERE team_id = ?')
        .bind(id)
        .first();
      return row !== null;
    },

    async delete(id: number): Promise<boolean> {
      const result = await db
        .prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(id)
        .run();
      return (result.meta.changes ?? 0) > 0;
    },
  };
}
