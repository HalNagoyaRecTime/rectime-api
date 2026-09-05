import { Context } from 'hono';
import { z } from 'zod';
import type { ITeamService } from '../../application/services/ITeamService';
import {
  errorResponse,
  type ApiErrorDefinition,
} from '../errors/errorResponse';
import { TeamErrors } from '../errors/teamErrors';

const MAX_LIMIT = 100;

const teamIdSchema = z.coerce.number().int().positive();

const teamListQuerySchema = z
  .object({
    search: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
    offset: z.coerce.number().int().min(0).optional(),
    sortBy: z.enum(['teamName', 'registeredAt', 'updatedAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  })
  .strict();

const teamWriteSchema = z
  .object({
    team_name: z.string().trim().min(1),
    class_codes: z
      .array(z.string().trim().min(1))
      .refine(codes => new Set(codes).size === codes.length, {
        message: 'class_codes must not contain duplicate values',
      }),
  })
  .strict();

function teamError(
  c: Context,
  error: unknown,
  fallback: ApiErrorDefinition<500>
) {
  if (error instanceof Error && error.message === 'Team not found') {
    return errorResponse(c, TeamErrors.TEAM_NOT_FOUND);
  }
  if (error instanceof Error && error.message === 'Class not found') {
    return errorResponse(c, TeamErrors.CLASS_ROOM_NOT_FOUND);
  }
  if (
    error instanceof Error &&
    error.message.includes('UNIQUE constraint failed') &&
    error.message.includes('teams.team_name')
  ) {
    return errorResponse(c, TeamErrors.TEAM_NAME_ALREADY_EXISTS);
  }
  return errorResponse(c, fallback);
}

export function createTeamController(teamService: ITeamService) {
  const getAllTeams = async (c: Context) => {
    const parsedQuery = teamListQuerySchema.safeParse(c.req.query());
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        TeamErrors.INVALID_TEAM_LIST_QUERY,
        parsedQuery.error.flatten()
      );
    }

    try {
      const teams = await teamService.getAllTeams(parsedQuery.data);
      return c.json(teams, 200);
    } catch {
      return errorResponse(c, TeamErrors.TEAM_LIST_FAILED);
    }
  };

  const getTeamById = async (c: Context) => {
    const parsedId = teamIdSchema.safeParse(c.req.param('teamId'));
    if (!parsedId.success) {
      return errorResponse(c, TeamErrors.INVALID_TEAM_ID);
    }

    try {
      const team = await teamService.getTeamById(parsedId.data);
      return c.json(team, 200);
    } catch (error) {
      if (error instanceof Error && error.message === 'Team not found') {
        return errorResponse(c, TeamErrors.TEAM_NOT_FOUND);
      }
      return errorResponse(c, TeamErrors.TEAM_FETCH_FAILED);
    }
  };

  const createTeam = async (c: Context) => {
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = teamWriteSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        TeamErrors.INVALID_TEAM_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const team = await teamService.createTeam(parsedBody.data);
      return c.json(team, 201);
    } catch (error) {
      return teamError(c, error, TeamErrors.TEAM_CREATE_FAILED);
    }
  };

  const updateTeam = async (c: Context) => {
    const parsedId = teamIdSchema.safeParse(c.req.param('teamId'));
    if (!parsedId.success) {
      return errorResponse(c, TeamErrors.INVALID_TEAM_ID);
    }

    const body = await c.req.json().catch(() => undefined);
    const parsedBody = teamWriteSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        TeamErrors.INVALID_TEAM_REQUEST,
        parsedBody.error.flatten()
      );
    }

    try {
      const team = await teamService.updateTeam(parsedId.data, parsedBody.data);
      return c.json(team, 200);
    } catch (error) {
      return teamError(c, error, TeamErrors.TEAM_UPDATE_FAILED);
    }
  };

  return {
    getAllTeams,
    getTeamById,
    createTeam,
    updateTeam,
  };
}
