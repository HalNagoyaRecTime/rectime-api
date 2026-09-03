import type { Context } from 'hono';
import { z } from 'zod';
import type { UserSearchQueryDTO } from '../../application/dto/UserSearchDTO';
import type { IUserSearchService } from '../../application/services/IUserSearchService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { UserErrors } from '../errors/userErrors';

const querySchema = z.object({
  q: z.string().trim().min(1).optional(),
  category: z.enum(['all', 'student', 'teacher']).default('all'),
  status: z.enum(['active', 'inactive', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

type UserSearchContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createUserSearchController(service: IUserSearchService) {
  const searchUsers = async (c: UserSearchContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
    }
    const parsedQuery = querySchema.safeParse({
      q: c.req.query('q'),
      category: c.req.query('category'),
      status: c.req.query('status'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return errorResponse(
        c,
        UserErrors.INVALID_USER_SEARCH_QUERY,
        parsedQuery.error.flatten()
      );
    }

    try {
      const query: UserSearchQueryDTO = parsedQuery.data;
      return c.json(await service.searchUsers(query), 200);
    } catch {
      return errorResponse(c, UserErrors.USER_SEARCH_FAILED);
    }
  };

  return { searchUsers };
}
