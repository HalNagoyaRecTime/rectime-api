export const MANUAL_NOTIFICATION_PRIORITY = 2;

export type ManualNotificationTargetType = 'all' | 'group';

export interface CreateManualNotificationInput {
  title: string;
  body: string;
  targetType: ManualNotificationTargetType;
  targetIds: string[];
}

export interface ManualNotificationEntity {
  id: number;
  type: 'manual';
  title: string;
  body: string;
  createdAt: string;
}

export interface ManualNotificationSendResult {
  notificationId: number;
  targetType: ManualNotificationTargetType;
  targetIds: string[];
  priority: number;
  tokens: number;
  sent: number;
  failed: number;
}
