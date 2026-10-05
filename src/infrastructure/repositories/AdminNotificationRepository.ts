import type { D1Database } from '@cloudflare/workers-types';
import type { ManualNotificationAudienceStatus } from '../../domain/entities/AdminNotification';
import type { IAdminNotificationRepository } from '../../domain/interfaces/repositories/IAdminNotificationRepository';
import { buildAudienceStatusStatement } from './AdminNotificationAudienceQuery';

interface AudienceStatusRow {
  target_exists: number;
  active_token_count: number;
}

export function createAdminNotificationRepository(
  db: D1Database
): IAdminNotificationRepository {
  return {
    async getAudienceStatus(audience) {
      const statement = buildAudienceStatusStatement(db, audience);
      return toAudienceStatus(await statement.first<AudienceStatusRow>());
    },
  };
}

function toAudienceStatus(
  row: AudienceStatusRow | null
): ManualNotificationAudienceStatus {
  return {
    exists: row?.target_exists === 1,
    active_token_count: row?.active_token_count ?? 0,
  };
}
