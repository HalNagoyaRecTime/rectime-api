export interface NotificationAudienceResolutionResult {
  status: 'resolved' | 'skipped';
  audienceCount: number;
  recipientCount: number;
}

export interface INotificationAudienceResolverService {
  resolveSchedule: (
    scheduleId: number,
    now?: Date
  ) => Promise<NotificationAudienceResolutionResult>;
}
