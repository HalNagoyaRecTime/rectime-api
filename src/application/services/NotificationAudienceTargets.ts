import type { NotificationAudienceTarget } from '../../domain/entities/AdminNotificationCommand';
import type { NotificationAudienceInputDTO } from '../dto/AdminNotificationDTO';

/** Audience入力をDomainの対象へ変換し、同じ対象を重複排除する */
export function toAudienceTargets(
  items: NotificationAudienceInputDTO['items']
): NotificationAudienceTarget[] {
  const targets = items.map(item =>
    item.type === 'all'
      ? { type: 'all' as const, target_id: null }
      : { type: item.type, target_id: item.targetId }
  );
  const unique = new Map<string, NotificationAudienceTarget>();
  for (const target of targets) {
    unique.set(target.type + ':' + String(target.target_id), target);
  }
  return Array.from(unique.values());
}
