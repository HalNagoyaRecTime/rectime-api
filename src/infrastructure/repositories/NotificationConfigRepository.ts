import type { D1Database } from '@cloudflare/workers-types';
import type { INotificationConfigRepository } from '../../domain/interfaces/repositories/INotificationConfigRepository';
import {
  areAudienceTargetsAvailable,
  buildAudienceUserSelect,
} from './NotificationAudienceUserQuery';

export function createNotificationConfigRepository(
  db: D1Database
): INotificationConfigRepository {
  return {
    async areAudienceTargetsAvailable(targets) {
      return areAudienceTargetsAvailable(db, targets);
    },

    async countAudienceUsers(targets) {
      if (targets.length === 0) return 0;
      const selects = targets.map(buildAudienceUserSelect);
      // Audience内・Audience間の同一Userを重複排除する。
      const row = await db
        .prepare(
          'SELECT COUNT(DISTINCT user_id) AS recipient_count FROM (' +
            selects.map(select => select.sql).join(' UNION ') +
            ')'
        )
        .bind(...selects.flatMap(select => select.params))
        .first<{ recipient_count: number }>();
      return row?.recipient_count ?? 0;
    },
  };
}
