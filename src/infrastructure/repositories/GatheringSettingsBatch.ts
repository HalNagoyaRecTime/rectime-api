import type { DrizzleD1Database } from 'drizzle-orm/d1';
import type { EventGatheringChangeSet } from '../../domain/entities/EventGathering';
import type { EventGatheringApplyOptions } from '../../domain/interfaces/repositories/IEventGatheringSettingsRepository';
import type * as schema from '../database/schema';
import { buildEventGatheringStatements } from './EventGatheringStatements';
import { buildGatheringNotificationStatements } from './GatheringNotificationStatements';

type GatheringSettingsDatabase = DrizzleD1Database<typeof schema>;

// 通知の保留・cleanupを先に実行し、集合予定の変更と原子的に確定する。
export async function applyGatheringSettingsBatch(
  orm: GatheringSettingsDatabase,
  changeSet: EventGatheringChangeSet,
  options: EventGatheringApplyOptions
): Promise<void> {
  const [first, ...rest] = [
    ...buildGatheringNotificationStatements(orm, changeSet, options),
    ...buildEventGatheringStatements(orm, changeSet),
  ];
  if (first) await orm.batch([first, ...rest]);
}
