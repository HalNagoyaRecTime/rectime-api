import type {
  NotificationAudienceResolverCandidate,
  UnresolvedNotificationAudience,
} from '../../entities/NotificationAudienceResolver';

export interface INotificationAudienceResolverRepository {
  findDueCandidates(
    now: string,
    limit: number
  ): Promise<NotificationAudienceResolverCandidate[]>;
  claimScheduled(scheduleId: number, now: string): Promise<boolean>;
  findUnresolvedAudiences(
    scheduleId: number
  ): Promise<UnresolvedNotificationAudience[]>;
  resolveAudience(
    scheduleId: number,
    audience: UnresolvedNotificationAudience,
    now: string
  ): Promise<void>;
  completeScheduleIfResolved(scheduleId: number, now: string): Promise<boolean>;
  countRecipients(scheduleId: number): Promise<number>;
}
