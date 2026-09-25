import type { Context } from 'hono';
import type { IEventGatheringSettingsService } from '../../application/services/IEventGatheringSettingsService';
import { CommonErrors } from '../errors/commonErrors';
import { errorResponse } from '../errors/errorResponse';
import { EventErrors } from '../errors/eventErrors';
import { toValidationErrorDetails } from '../errors/validationErrorDetails';
import { eventGatheringSettingsWriteSchema } from '../openapi/eventGatheringSettings';
import { eventIdParams } from '../openapi/events';

// Serviceが投げる失敗理由と応答の対応。ここに無いものは想定外として500にする。
const SERVICE_ERRORS = {
  'Event not found': EventErrors.EVENT_NOT_FOUND,
  'Gathering not found': EventErrors.GATHERING_NOT_FOUND,
  'Gathering spot not found': EventErrors.GATHERING_SPOT_NOT_FOUND,
  'Gathering in use': EventErrors.GATHERING_IN_USE,
} as const;

export function createEventGatheringSettingsController(
  service: IEventGatheringSettingsService
) {
  const saveEventGatheringSettings = async (c: Context) => {
    const eventId = parseEventId(c);
    if (eventId instanceof Response) return eventId;

    // ルート側(OpenAPI)の検証を通過した値しか来ない。ここは保険であり、
    // 応答コードはルート側の validationDefaultHook と同じものに揃える。
    const body = await c.req.json().catch(() => undefined);
    const parsedBody = eventGatheringSettingsWriteSchema.safeParse(body);
    if (!parsedBody.success) {
      return errorResponse(
        c,
        CommonErrors.VALIDATION_ERROR,
        toValidationErrorDetails(parsedBody.error)
      );
    }

    try {
      const result = await service.saveEventGatheringSettings({
        event_id: eventId,
        rounds: parsedBody.data.rounds,
      });
      return c.json(result, 200);
    } catch (error) {
      const known =
        error instanceof Error
          ? SERVICE_ERRORS[error.message as keyof typeof SERVICE_ERRORS]
          : undefined;
      if (known) {
        return errorResponse(c, known);
      }
      // 想定外の失敗はDB由来の例外が多く、文面にテーブル名や制約名が含まれる。
      // 調査に必要な情報はログへ出し、応答には失敗した事実だけを返す。
      console.error('Failed to save event gathering settings', error);
      return errorResponse(c, EventErrors.EVENT_GATHERINGS_UPDATE_FAILED);
    }
  };

  return { saveEventGatheringSettings };
}

// eventId もルート側の positivePathParam で検証済み。ここも保険なので
// 応答コードをルート側と揃える。
function parseEventId(c: Context) {
  const parsed = eventIdParams.safeParse({ eventId: c.req.param('eventId') });
  return parsed.success
    ? Number(parsed.data.eventId)
    : errorResponse(c, CommonErrors.VALIDATION_ERROR);
}
