import { Context } from 'hono';
import { z } from 'zod';
import { IMasterImportService } from '../../application/services/IMasterImportService';
import type { Env } from '../../lib/env';
import type { AuthenticationVariables } from '../middleware/bearerAuthentication';
import type { ContainerVariables } from '../middleware/diContainer';
import type { AuthVariables } from '../middleware/requireAuth';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { MasterImportErrors } from '../errors/masterImportErrors';

const masterImportTypeSchema = z.enum(['students', 'classrooms', 'teachers']);

const paginationSchema = z.object({
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(2000).default(100),
});

type MasterImportContext = Context<{
  Bindings: Env;
  Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
}>;

export function createMasterImportController(
  masterImportService: IMasterImportService
) {
  const createImport = async (c: MasterImportContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
    }
    const body = await c.req.parseBody().catch(() => null);
    if (!body) {
      return errorResponse(c, MasterImportErrors.INVALID_MULTIPART_REQUEST);
    }

    const parsedType = masterImportTypeSchema.safeParse(body.type);
    if (!parsedType.success) {
      return errorResponse(c, MasterImportErrors.INVALID_IMPORT_TYPE);
    }

    const file = body.file;
    if (!(file instanceof File)) {
      return errorResponse(c, MasterImportErrors.IMPORT_FILE_REQUIRED);
    }

    try {
      const session = await masterImportService.createImport({
        createUserId: userId,
        type: parsedType.data,
        file,
        fileName: file.name,
      });
      return c.json(session, 201);
    } catch {
      return errorResponse(c, MasterImportErrors.IMPORT_FILE_INVALID);
    }
  };

  const getImport = async (c: MasterImportContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
    }
    const validatedFileId = c.req.param('validatedFileId');
    if (!validatedFileId) {
      return errorResponse(c, MasterImportErrors.INVALID_IMPORT_ID);
    }
    const parsedPagination = paginationSchema.safeParse({
      offset: c.req.query('offset'),
      limit: c.req.query('limit'),
    });
    if (!parsedPagination.success) {
      return errorResponse(
        c,
        CommonErrors.INVALID_PAGINATION_QUERY,
        parsedPagination.error.flatten()
      );
    }

    try {
      const session = await masterImportService.getImport(
        validatedFileId,
        parsedPagination.data,
        userId
      );
      if (!session) {
        return errorResponse(
          c,
          (await masterImportService.isExpiredImport(validatedFileId, userId))
            ? MasterImportErrors.IMPORT_EXPIRED
            : MasterImportErrors.IMPORT_NOT_FOUND
        );
      }
      return c.json(session, 200);
    } catch {
      return errorResponse(c, MasterImportErrors.IMPORT_FETCH_FAILED);
    }
  };

  const commitImport = async (c: MasterImportContext) => {
    const userId = c.get('authenticatedUserId');
    if (userId === null) {
      return errorResponse(c, CommonErrors.UNAUTHORIZED);
    }
    const validatedFileId = c.req.param('validatedFileId');
    if (!validatedFileId) {
      return errorResponse(c, MasterImportErrors.INVALID_IMPORT_ID);
    }

    try {
      const outcome = await masterImportService.commitImport(
        validatedFileId,
        userId
      );

      if (outcome.status === 'not_found') {
        return errorResponse(
          c,
          (await masterImportService.isExpiredImport(validatedFileId, userId))
            ? MasterImportErrors.IMPORT_EXPIRED
            : MasterImportErrors.IMPORT_NOT_FOUND
        );
      }
      if (outcome.status === 'has_errors') {
        return c.json(outcome.session, 422);
      }
      if (outcome.status === 'timeout') {
        c.header('Retry-After', '3');
        return errorResponse(c, MasterImportErrors.COMMIT_IN_PROGRESS);
      }
      return c.json(outcome.session, outcome.alreadyCommitted ? 200 : 201);
    } catch {
      return errorResponse(c, MasterImportErrors.IMPORT_COMMIT_FAILED);
    }
  };

  return {
    createImport,
    getImport,
    commitImport,
  };
}
