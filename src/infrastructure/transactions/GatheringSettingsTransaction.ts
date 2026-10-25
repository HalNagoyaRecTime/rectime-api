import type { D1Database } from '@cloudflare/workers-types';
import { drizzle } from 'drizzle-orm/d1';
import type { IGatheringSettingsTransaction } from '../../domain/interfaces/transactions/IGatheringSettingsTransaction';
import * as schema from '../database/schema';
import { buildEventGatheringStatements } from '../repositories/EventGatheringStatements';
import { buildGatheringNotificationStatements } from '../repositories/GatheringNotificationStatements';

export function createGatheringSettingsTransaction(
  db: D1Database
): IGatheringSettingsTransaction {
  const orm = drizzle(db, { schema });
  return {
    async apply(changeSet, notifications = {}) {
      // 通知を先に処理し、集合予定の変更と同じbatchで確定する。
      const [first, ...rest] = [
        ...buildGatheringNotificationStatements(
          orm,
          changeSet.event_id,
          notifications
        ),
        ...buildEventGatheringStatements(orm, changeSet),
      ];
      if (first) await orm.batch([first, ...rest]);
    },
  };
}
