import { Context } from 'hono';
import { z } from 'zod';
import type { IRankingService } from '../../application/services/IRankingService';
import { errorResponse } from '../errors/errorResponse';
import { TeamErrors } from '../errors/teamErrors';

const MAX_LIMIT = 100;

const teamIdSchema = z.coerce.number().int().positive();

const rankingListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.coerce.number().int().min(0).optional(),
  })
  .strict();

const teamScoreAddSchema = z
  .object({
    points: z.number().int(),
  })
  .strict();

export function createRankingController(rankingService: IRankingService) {
  const getRanking = async (c: Context) => {
    const parsedQuery = rankingListQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        TeamErrors.INVALID_RANKING_LIST_QUERY,
        parsedQuery.error.flatten()
      );
    }

    try {
      const ranking = await rankingService.getRanking(parsedQuery.data);
      return c.json(ranking, 200);
    } catch {
      return errorResponse(c, TeamErrors.RANKING_LIST_FAILED);
    }
  };

  const getTeamById = async (c: Context) => {
    const parsedId = teamIdSchema.safeParse(c.req.param('teamId'));
    if (!parsedId.success) {
      return errorResponse(c, TeamErrors.INVALID_TEAM_ID);
    }

    try {
      const team = await rankingService.getTeamById(parsedId.data);
      return c.json(team, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Team not found') {
        return errorResponse(c, TeamErrors.TEAM_NOT_FOUND);
      }
      return errorResponse(c, TeamErrors.TEAM_FETCH_FAILED);
    }
  };

  const addTeamScore = async (c: Context) => {
    const parsedId = teamIdSchema.safeParse(c.req.param('teamId'));
    if (!parsedId.success) {
      return errorResponse(c, TeamErrors.INVALID_TEAM_ID);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = teamScoreAddSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        TeamErrors.INVALID_TEAM_SCORE_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const team = await rankingService.addTeamScore(
        parsedId.data,
        parsedBody.data
      );
      return c.json(team, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Team not found') {
        return errorResponse(c, TeamErrors.TEAM_NOT_FOUND);
      }
      return errorResponse(c, TeamErrors.TEAM_SCORE_UPDATE_FAILED);
    }
  };

  return {
    getRanking,
    getTeamById,
    addTeamScore,
  };
}
