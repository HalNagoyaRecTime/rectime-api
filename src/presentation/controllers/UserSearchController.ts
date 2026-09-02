import type { Context } from 'hono';
import { z } from 'zod';
import type { UserSearchQueryDTO } from '../../application/dto/UserSearchDTO';
import type { IUserSearchService } from '../../application/services/IUserSearchService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthVariables } from '../middleware/requireAuth';

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
      return c.json({ error: 'Authentication required' }, 401);
    }

    const parsedQuery = querySchema.safeParse({
      q: c.req.query('q'),
      category: c.req.query('category'),
      status: c.req.query('status'),
      limit: c.req.query('limit'),
      offset: c.req.query('offset'),
    });
    if (!parsedQuery.success) {
      return c.json(
        {
          error: 'Invalid user search query',
          details: parsedQuery.error.flatten(),
        },
        400
      );
    }

    try {
      const query: UserSearchQueryDTO = parsedQuery.data;
      return c.json(await service.searchUsers(query), 200);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to search users',
          details: error instanceof Error ? error.message : String(error),
        },
        500
      );
    }
  };

  return { searchUsers };
}
