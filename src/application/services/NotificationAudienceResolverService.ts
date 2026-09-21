import type { INotificationAudienceResolverRepository } from '../../domain/interfaces/repositories/INotificationAudienceResolverRepository';
import type { INotificationAudienceResolverService } from './INotificationAudienceResolverService';

export function createNotificationAudienceResolverService(
  repository: INotificationAudienceResolverRepository
): INotificationAudienceResolverService {
  return {
    async resolveSchedule(scheduleId, now = new Date()) {
      const resolvedAt = now.toISOString();
      const claimed = await repository.claimScheduleForResolution(
        scheduleId,
        resolvedAt
      );
      if (!claimed) {
        return {
          status: 'skipped',
          audienceCount: 0,
          recipientCount: 0,
        };
      }

      const audiences = await repository.findUnresolvedAudiences(scheduleId);
      let recipientCount = 0;

      // Audienceごとに「検索→Recipient登録→resolved_at更新」を完了させる。
      // 途中で失敗したAudienceは未解決のまま残るため、後続の再実行で
      // 同じAudienceだけを処理できる。
      for (const audience of audiences) {
        const userIds = await repository.findAudienceUserIds({
          audienceType: audience.audienceType,
          targetId: audience.targetId,
        });
        await repository.insertRecipients(scheduleId, userIds);
        await repository.markAudienceResolved(audience.id, resolvedAt);
        recipientCount += userIds.length;
      }

      await repository.markRecipientsResolved(scheduleId, resolvedAt);

      return {
        status: 'resolved',
        audienceCount: audiences.length,
        recipientCount,
      };
    },
  };
}
