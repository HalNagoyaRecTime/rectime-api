import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createTeamRepository } from '../../../src/infrastructure/repositories/TeamRepository';
import { createReadCountingDb } from '../../readCountingDb';

const TEAMS = 60;
const MAX_ROWS_READ_PER_TEAM = 2;

describe('TeamRepository.findRanking の読み取り行数', () => {
  beforeAll(async () => {
    await env.DB.batch([
      env.DB.prepare(
        `WITH RECURSIVE seq(n) AS (SELECT 0 UNION ALL SELECT n + 1 FROM seq WHERE n < ${TEAMS - 1})
         INSERT INTO teams (team_name) SELECT 'reads-team' || n FROM seq`
      ),
      env.DB.prepare(
        `INSERT INTO team_scores (team_id, scores)
         SELECT team_id, (team_id * 37) % 500 FROM teams`
      ),
    ]);
  });

  it.each([
    [{ limit: 100, offset: 0 }],
    [{ limit: 10, offset: 20 }],
    [{ search: 'reads-team1', limit: 100, offset: 0 }],
  ])('%o でもチーム1件につき2行までしか読まない', async options => {
    const counting = createReadCountingDb();

    await createTeamRepository(counting.db).findRanking(options);

    expect(counting.rowsRead()).toBeLessThanOrEqual(
      TEAMS * MAX_ROWS_READ_PER_TEAM
    );
  });
});
