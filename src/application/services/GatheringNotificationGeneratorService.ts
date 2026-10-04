import type { NotificationAudienceTarget } from '../../domain/entities/NotificationCreation';
import { DEFAULT_NOTIFICATION_IMPORTANCE } from '../../domain/entities/Notification';
import type { INotificationCreationRepository } from '../../domain/interfaces/repositories/INotificationCreationRepository';
import type { IGatheringNotificationGeneratorRepository } from '../../domain/interfaces/repositories/IGatheringNotificationGeneratorRepository';
import { buildEventNotificationSendAt } from '../../lib/eventDate';

export interface IGatheringNotificationGeneratorService {
  generate(
    gatheringId: number
  ): Promise<'created' | 'updated' | 'already_exists' | 'not_found'>;
}

export function createGatheringNotificationGeneratorService(
  gatheringRepository: IGatheringNotificationGeneratorRepository,
  notificationCreationRepository: INotificationCreationRepository,
  eventDate: string | undefined = undefined,
  now: () => string = () => new Date().toISOString()
): IGatheringNotificationGeneratorService {
  return {
    async generate(gatheringId) {
      const gatheringTime =
        await gatheringRepository.findGatheringTime(gatheringId);
      if (gatheringTime === null) return 'not_found';

      if (!eventDate) {
        throw new Error(
          'EVENT_DATE must be configured for gathering reminders'
        );
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
          legacy_schedule: null,
        });
      return outcome.status;
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
