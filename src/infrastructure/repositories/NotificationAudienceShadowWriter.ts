import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type {
  NotificationAudience,
  NotificationAudienceShadowWriteInput,
} from '../../domain/entities/NotificationAudience';

type ShadowWriteSource = 'manual' | 'event';

export async function shadowWriteNotificationAudiences(
  db: D1Database,
  inputs: NotificationAudienceShadowWriteInput[],
  source: ShadowWriteSource
): Promise<void> {
  if (inputs.length === 0) return;

  try {
    const results = await db.batch(
      inputs.map(input => buildInsertStatement(db, input))
    );
    if (
      results.length !== inputs.length ||
      results.some(result => result.meta.changes !== 1)
    ) {
      throw new Error('Audienceの保存件数が一致しません');
    }
  } catch (error) {
    logShadowWriteFailure(source, inputs.length, error);
  }
}

export async function replaceNotificationAudienceShadow(
  db: D1Database,
  input: NotificationAudienceShadowWriteInput,
  source: ShadowWriteSource
): Promise<void> {
  try {
    const results = await db.batch([
      db
        .prepare(
          `DELETE FROM notification_audiences
           WHERE notification_id = ?`
        )
        .bind(input.notification_id),
      buildInsertStatement(db, input),
    ]);
    if (results.length !== 2 || results[1]?.meta.changes !== 1) {
      throw new Error('Audienceの置換件数が一致しません');
    }
  } catch (error) {
    logShadowWriteFailure(source, 1, error);
  }
}

function buildInsertStatement(
  db: D1Database,
  input: NotificationAudienceShadowWriteInput
): D1PreparedStatement {
  const row = toAudienceRow(input.audience);
  return db
    .prepare(
      `INSERT INTO notification_audiences (
         notification_id,
         audience_type,
         class_room_id,
         gathering_id,
         event_id,
         user_id,
         user_ids
       ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      input.notification_id,
      row.audience_type,
      row.class_room_id,
      row.gathering_id,
      row.event_id,
      row.user_id,
      row.user_ids
    );
}

function toAudienceRow(audience: NotificationAudience): {
  audience_type: NotificationAudience['type'];
  class_room_id: number | null;
  gathering_id: number | null;
  event_id: number | null;
  user_id: number | null;
  user_ids: string | null;
} {
  const row = {
    audience_type: audience.type,
    class_room_id: null as number | null,
    gathering_id: null as number | null,
    event_id: null as number | null,
    user_id: null as number | null,
    user_ids: null as string | null,
  };

  switch (audience.type) {
    case 'all':
      return row;
    case 'class_room':
      return { ...row, class_room_id: audience.class_room_id };
    case 'gathering':
      return { ...row, gathering_id: audience.gathering_id };
    case 'event_participants':
      return { ...row, event_id: audience.event_id };
    case 'user':
      return { ...row, user_id: audience.user_id };
    case 'users':
      return {
        ...row,
        user_ids: JSON.stringify([...new Set(audience.user_ids)]),
      };
  }

  throw new Error('未対応のAudience種別です');
}

function logShadowWriteFailure(
  source: ShadowWriteSource,
  audienceCount: number,
  error: unknown
): void {
  console.error('[NOTIFICATION_AUDIENCE] Shadow Writeに失敗しました', {
    source,
    audienceCount,
    error: error instanceof Error ? error.message : String(error),
  });
}
