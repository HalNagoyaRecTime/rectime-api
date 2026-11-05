import type { NotificationAudienceTarget } from '../../domain/entities/NotificationCreation';
import { DEFAULT_NOTIFICATION_IMPORTANCE } from '../../domain/entities/Notification';
import type { INotificationCreationRepository } from '../../domain/interfaces/repositories/INotificationCreationRepository';
import type { IGatheringNotificationGeneratorRepository } from '../../domain/interfaces/repositories/IGatheringNotificationGeneratorRepository';
import {
  buildEventNotificationSendAt,
  isValidEventDate,
} from '../../lib/eventDate';

export interface GatheringNotificationReconciliationResult {
  processed_count: number;
  failed_gathering_ids: number[];
}

export interface IGatheringNotificationGeneratorService {
  generate(
    gatheringId: number,
    syncCutoff?: string
  ): Promise<
    'created' | 'updated' | 'already_exists' | 'not_found' | 'skipped'
  >;
  reconcileAll(): Promise<GatheringNotificationReconciliationResult>;
}

const GENERATOR_SYNC_MAX_ATTEMPTS = 4;

export function createGatheringNotificationGeneratorService(
  gatheringRepository: IGatheringNotificationGeneratorRepository,
  notificationCreationRepository: INotificationCreationRepository,
  eventDate: string | undefined = undefined,
  now: () => string = () => new Date().toISOString()
): IGatheringNotificationGeneratorService {
  const generate = async (
    gatheringId: number,
    syncCutoff?: string
  ): Promise<
    'created' | 'updated' | 'already_exists' | 'not_found' | 'skipped'
  > => {
    let lastOutcome: 'created' | 'updated' | 'already_exists' | undefined;

    for (let attempt = 0; attempt < GENERATOR_SYNC_MAX_ATTEMPTS; attempt++) {
      const gatheringTime =
        await gatheringRepository.findGatheringTime(gatheringId);
      if (gatheringTime === null) return 'not_found';

      if (!isValidEventDate(eventDate)) {
        console.warn(
          '[GATHERING_NOTIFICATION] EVENT_DATE未設定または不正のため自動通知を保留します'
        );
        return 'skipped';
      }
      const sourceHash = await createGatheringTimeSourceHash(gatheringTime);
      const audiences: NotificationAudienceTarget[] = [
        { type: 'gathering', target_id: gatheringId },
      ];
      const timestamp = now();
      const outcome =
        await notificationCreationRepository.createOrUpdateAutomatic({
          created_by_user_id: null,
          scheduled_by_user_id: null,
          push_title: '集合時間のお知らせ',
          push_body: `集合時間は${gatheringTime}です。`,
          detail_title: '集合時間のお知らせ',
          detail_body: `集合時間は${gatheringTime}です。`,
          importance: DEFAULT_NOTIFICATION_IMPORTANCE,
          send_at: buildEventNotificationSendAt(eventDate, gatheringTime),
          audiences,
          source: {
            type: 'gathering',
            id: gatheringId,
            hash: sourceHash,
          },
          now: timestamp,
          ...(syncCutoff ? { sync_cutoff: syncCutoff } : {}),
        });
      lastOutcome = outcome.status;

      const currentGatheringTime =
        await gatheringRepository.findGatheringTime(gatheringId);
      if (currentGatheringTime === null) return 'not_found';
      if (currentGatheringTime === gatheringTime) {
        await gatheringRepository.clearAutomaticScheduleHold(
          gatheringId,
          gatheringTime
        );
        return lastOutcome;
      }
    }

    throw new Error(
      `Gathering ${gatheringId} の集合時間が連続更新され、自動通知を同期できませんでした`
    );
  };

  return {
    generate,

    async reconcileAll() {
      if (!isValidEventDate(eventDate)) {
        return { processed_count: 0, failed_gathering_ids: [] };
      }

      const syncCutoff = new Date(
        Date.parse(now()) + 10 * 60_000
      ).toISOString();
      const gatheringIds =
        await gatheringRepository.findConfiguredGatheringIds();
      const failedGatheringIds: number[] = [];
      let processedCount = 0;

      for (const gatheringId of gatheringIds) {
        try {
          await generate(gatheringId, syncCutoff);
          processedCount++;
        } catch {
          failedGatheringIds.push(gatheringId);
          await gatheringRepository.holdAutomaticSchedules(gatheringId);
        }
      }

      return {
        processed_count: processedCount,
        failed_gathering_ids: failedGatheringIds,
      };
    },
  };
}

/** Hash対象はgathering_timeのみ。ローカル時刻として扱い、UTC変換しない。 */
export async function createGatheringTimeSourceHash(
  gatheringTime: string | null
): Promise<string> {
  const normalizedTime = gatheringTime === null ? 'null' : gatheringTime.trim();
  const input = `gathering-notification-generator:v1\ngathering_time=${normalizedTime}\n`;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
