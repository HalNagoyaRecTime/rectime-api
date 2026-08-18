import { Context } from 'hono';
import { z } from 'zod';
import { IMasterImportService } from '../../application/services/IMasterImportService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { ContainerVariables } from '../middleware/diContainer';

const masterImportTypeSchema = z.enum(['students', 'classrooms', 'teachers']);

const paginationSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(2000).default(100),
});

type MasterImportContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthenticationVariables;
}>;

export function createMasterImportController(
  masterImportService: IMasterImportService
) {
  const createImport = async (c: MasterImportContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    const body = await c.req.parseBody().catch(() => null);
    if (!body) {
      return c.json({ error: 'Invalid multipart request body' }, 400);
    }

    const parsedType = masterImportTypeSchema.safeParse(body.type);
    if (!parsedType.success) {
      return c.json(
        {
          error:
            'Invalid or missing "type" field (expected students, classrooms or teachers)',
        },
        400
      );
    }

    const file = body.file;
    if (!(file instanceof File)) {
      return c.json({ error: 'Missing "file" field' }, 400);
    }

    try {
      const session = await masterImportService.createImport({
        createUserId: userId,
        type: parsedType.data,
        file,
        fileName: file.name,
      });
      return c.json(session, 201);
    } catch (error) {
      return c.json(
        {
          error: 'Failed to parse import file',
          details: error instanceof Error ? error.message : String(error),
        },
        400
      );
    }
  };

  const getImport = async (c: MasterImportContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    const validatedFileId = c.req.param('validatedFileId');
    if (!validatedFileId) {
      return c.json({ error: 'Invalid import ID' }, 400);
    }
    const parsedPagination = paginationSchema.safeParse({
      offset: c.req.query('offset'),
      limit: c.req.query('limit'),
    });
    if (!parsedPagination.success) {
      return c.json(
        {
          error: 'Invalid pagination query',
          details: parsedPagination.error.flatten(),
        },
        400
      );
    }

    try {
      const session = await masterImportService.getImport(
        validatedFileId,
        parsedPagination.data,
        userId
      );
      if (!session) {
        return c.json({ error: 'Import not found' }, 404);
      }
      return c.json(session, 200);
    } catch {
      return c.json({ error: 'Failed to fetch import' }, 500);
    }
  };

  const commitImport = async (c: MasterImportContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    const validatedFileId = c.req.param('validatedFileId');
    if (!validatedFileId) {
      return c.json({ error: 'Invalid import ID' }, 400);
    }

    try {
      const outcome = await masterImportService.commitImport(
        validatedFileId,
        userId
      );

      if (outcome.status === 'not_found') {
        return c.json({ error: 'Import not found' }, 404);
      }
      if (outcome.status === 'has_errors') {
        return c.json(outcome.session, 422);
      }
      if (outcome.status === 'timeout') {
        c.header('Retry-After', '3');
        return c.json(
          {
            error: 'Commit is still in progress, please retry',
            error_code: 'COMMIT_IN_PROGRESS',
          },
          503
        );
      }
      return c.json(outcome.session, outcome.alreadyCommitted ? 200 : 201);
    } catch {
      return c.json({ error: 'Failed to commit import' }, 500);
    }
  };

  return {
    createImport,
    getImport,
    commitImport,
  };
}
