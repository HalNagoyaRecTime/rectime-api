import type {
  NotificationAudienceType,
  NotificationAudienceTargetType,
} from '../../entities/NotificationV3';

export interface NotificationAudienceRecord {
  id: number;
  scheduleId: number;
  audienceType: NotificationAudienceType;
  targetId: number | null;
}

export interface NotificationAudienceTarget {
  audienceType: NotificationAudienceTargetType | 'all';
  targetId: number | null;
}

export interface INotificationAudienceResolverRepository {
  claimScheduleForResolution: (
    scheduleId: number,
    dueAt: string
  ) => Promise<boolean>;
  findUnresolvedAudiences: (
    scheduleId: number
  ) => Promise<NotificationAudienceRecord[]>;
  findAudienceUserIds: (
    audience: NotificationAudienceTarget
  ) => Promise<number[]>;
  insertRecipients: (scheduleId: number, userIds: number[]) => Promise<void>;
  markAudienceResolved: (
    audienceId: number,
    resolvedAt: string
  ) => Promise<boolean>;
  markRecipientsResolved: (
    scheduleId: number,
    resolvedAt: string
  ) => Promise<boolean>;
}
