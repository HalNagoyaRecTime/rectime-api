import type { Context } from 'hono';
import type { IGatheringImportService } from '../../application/services/IGatheringImportService';
import { MAX_IMPORT_FILE_SIZE_BYTES } from '../../infrastructure/masterImports/parseImportFile';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';
import { toValidationErrorDetails } from '../errors/validationErrorDetails';
import { eventIdParams } from '../openapi/events';
import {
  gatheringImportCommitSchema,
  gatheringImportPreviewSchema,
} from '../openapi/gatheringImports';

const PREVIEW_ERRORS = {
  'Event not found': EventErrors.EVENT_NOT_FOUND,
  'Missing gathering import columns': EventErrors.INVALID_GATHERING_IMPORT_FILE,
  'Too many gathering import rows': EventErrors.GATHERING_IMPORT_TOO_MANY_ROWS,
} as const;

const COMMIT_ERRORS = {
  ...PREVIEW_ERRORS,
  'No gathering import rows': EventErrors.GATHERING_IMPORT_NO_ROWS,
  'Event update conflict': EventErrors.EVENT_UPDATE_CONFLICT,
} as const;

// Excelの「CSV」はShift_JISで書き出す。置換文字のまま読むと生徒も集合場所も
// 見つからないエラーが全行に並ぶだけなので、UTF-8でなければ読む前に断る。
async function readUtf8(file: File): Promise<string | null> {
  if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) return null;
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(
      await file.arrayBuffer()
    );
  } catch {
    return null;
  }
}

async function readRequest(c: Context) {
  const eventId = eventIdParams.safeParse({ eventId: c.req.param('eventId') });
  const body = await c.req.parseBody().catch(() => null);
  const parsed = gatheringImportPreviewSchema.safeParse(body);
  if (!eventId.success || !parsed.success) {
    return errorResponse(
      c,
      CommonErrors.VALIDATION_ERROR,
      parsed.success ? undefined : toValidationErrorDetails(parsed.error)
    );
  }
  const csvText = await readUtf8(parsed.data.file);
  if (csvText === null) {
    return errorResponse(c, EventErrors.INVALID_GATHERING_IMPORT_FILE);
  }
  return { eventId: Number(eventId.data.eventId), csvText, body };
}

function findServiceError<Errors extends object>(
  errors: Errors,
  error: unknown
): Errors[keyof Errors] | undefined {
  if (!(error instanceof Error) || !(error.message in errors)) return undefined;
  return errors[error.message as keyof Errors];
}

export function createGatheringImportController(
  service: IGatheringImportService
) {
  return {
    async preview(c: Context) {
      const request = await readRequest(c);
      if (request instanceof Response) return request;
      try {
        const result = await service.preview({
          event_id: request.eventId,
          csv_text: request.csvText,
        });
        return c.json(result, 200);
      } catch (error) {
        const known = findServiceError(PREVIEW_ERRORS, error);
        if (known) return errorResponse(c, known);
        console.error('Failed to preview gathering import', error);
        return errorResponse(c, EventErrors.GATHERING_IMPORT_FAILED);
      }
    },
    async commit(c: Context) {
      const request = await readRequest(c);
      if (request instanceof Response) return request;
      const parsed = gatheringImportCommitSchema.safeParse(request.body);
      if (!parsed.success) {
        return errorResponse(
          c,
          CommonErrors.VALIDATION_ERROR,
          toValidationErrorDetails(parsed.error)
        );
      }
      try {
        const result = await service.commit({
          event_id: request.eventId,
          csv_text: request.csvText,
          lock_version: parsed.data.lock_version,
        });
        return c.json(result, 200);
      } catch (error) {
        const known = findServiceError(COMMIT_ERRORS, error);
        if (known) return errorResponse(c, known);
        // 想定外の失敗はDB由来の例外が多く、文面にテーブル名や制約名が含まれる。
        console.error('Failed to commit gathering import', error);
        return errorResponse(c, EventErrors.GATHERING_IMPORT_FAILED);
      }
    },
  };
}
