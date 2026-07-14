import { D1Database } from '@cloudflare/workers-types';
import {
  CreateManualNotificationInput,
  ManualNotificationEntity,
} from '../../domain/entities/ManualNotification';
import { IManualNotificationRepository } from '../../domain/interfaces/repositories/IManualNotificationRepository';

function toManualNotificationEntity(
  row: Record<string, unknown>
): ManualNotificationEntity {
  return {
    id: row.id as number,
    type: row.type as 'manual',
    title: row.title as string,
    body: row.body as string,
    createdAt: row.created_at as string,
  };
}

export function createManualNotificationRepository(
  db: D1Database
): IManualNotificationRepository {
  return {
    async create(
      input: Pick<CreateManualNotificationInput, 'title' | 'body'>
    ): Promise<ManualNotificationEntity> {
      const notification = await db
        .prepare(
          `
          INSERT INTO notifications (
            type,
            title,
            body
          )
          VALUES ('manual', ?, ?)
          RETURNING *
          `
        )
        .bind(input.title, input.body)
        .first<Record<string, unknown>>();

      if (!notification) {
        throw new Error('Failed to create manual notification');
      }

      return toManualNotificationEntity(notification);
    },
  };
}
