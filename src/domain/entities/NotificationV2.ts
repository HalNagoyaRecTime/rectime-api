export const NOTIFICATION_SCHEDULE_STATUSES = [
  'scheduled',
  'resolving',
  'sending',
  'completed',
  'failed',
  'stopped',
] as const;

export type NotificationScheduleStatus =
  (typeof NOTIFICATION_SCHEDULE_STATUSES)[number];

export const NOTIFICATION_PUSH_DELIVERY_STATUSES = [
  'pending',
  'sending',
  'retry_wait',
  'sent',
  'failed',
  'stopped',
] as const;

export type NotificationPushDeliveryStatus =
  (typeof NOTIFICATION_PUSH_DELIVERY_STATUSES)[number];

export const NOTIFICATION_AUDIENCE_TYPES = [
  'all',
  'class_room',
  'gathering',
  'event',
  'user',
] as const;

export type NotificationAudienceType =
  (typeof NOTIFICATION_AUDIENCE_TYPES)[number];

export const NOTIFICATION_TARGET_AUDIENCE_TYPES = [
  'class_room',
  'gathering',
  'event',
  'user',
] as const;

export const NOTIFICATION_IMPORTANCE_LEVELS = [
  'low',
  'normal',
  'high',
] as const;

export type NotificationImportance =
  (typeof NOTIFICATION_IMPORTANCE_LEVELS)[number];

export const NOTIFICATION_DELIVERY_TYPES = ['immediate', 'scheduled'] as const;

export type NotificationDeliveryType =
  (typeof NOTIFICATION_DELIVERY_TYPES)[number];

export const NOTIFICATION_CREATION_METHODS = ['manual', 'automatic'] as const;

export type NotificationCreationMethod =
  (typeof NOTIFICATION_CREATION_METHODS)[number];

export const NOTIFICATION_STOP_REASONS = ['manual', 'source_deleted'] as const;

export type NotificationStopReason = (typeof NOTIFICATION_STOP_REASONS)[number];
