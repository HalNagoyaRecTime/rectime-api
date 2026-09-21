import type {
  NotificationPushDeliveryStatus,
  NotificationScheduleStatus,
} from '../../domain/entities/Notification';
import type {
  NotificationAudienceDTO,
  NotificationContentDTO,
  NotificationCreationDTO,
  NotificationDeliveryInputDTO,
  NotificationScheduleStopDTO,
  NotificationUserReferenceDTO,
} from './AdminNotificationDTO';

export interface NotificationRecipientResolutionDTO {
  status: 'pending' | 'resolved';
  resolvedCount: number;
}

export interface NotificationScheduleAudienceDTO extends NotificationAudienceDTO {
  recipientResolution: NotificationRecipientResolutionDTO;
}

export interface NotificationRecipientPushSummaryDTO {
  totalCount: number;
  successCount: number;
  failedCount: number;
  noPushTargetCount: number;
}

export interface NotificationScheduleSummaryDTO {
  notificationScheduleId: number;
  sendAt: string;
  status: NotificationScheduleStatus;
  stop: NotificationScheduleStopDTO | null;
  scheduledBy: NotificationUserReferenceDTO | null;
  createdAt: string;
  audience: NotificationScheduleAudienceDTO;
  recipientPushSummary: NotificationRecipientPushSummaryDTO;
}

export interface NotificationAudienceProgressDTO {
  totalCount: number;
  resolvedCount: number;
}

export interface NotificationRecipientProgressDTO {
  count: number;
  status: 'pending' | 'resolved';
}

export interface NotificationDeliveryProgressDTO {
  totalCount: number;
  pendingCount: number;
  sendingCount: number;
  retryWaitCount: number;
  sentCount: number;
  failedCount: number;
  stoppedCount: number;
}

export interface NotificationScheduleProgressDTO {
  audienceProgress: NotificationAudienceProgressDTO;
  recipientProgress: NotificationRecipientProgressDTO;
  deliveryProgress: NotificationDeliveryProgressDTO;
}

export interface NotificationScheduleMonitorListItemDTO extends NotificationScheduleSummaryDTO {
  notificationId: number;
  content: NotificationContentDTO;
  creation: NotificationCreationDTO;
  startedAt: string | null;
  completedAt: string | null;
  progress: NotificationScheduleProgressDTO;
}

export interface NotificationScheduleDetailDTO extends NotificationScheduleMonitorListItemDTO {
  updatedAt: string;
}

export interface NotificationPushDeliveryDetailDTO {
  notificationPushDeliveryId: number;
  notificationRecipientId: number;
  firebaseTokenId: number | null;
  platform: 'ios' | 'android';
  status: NotificationPushDeliveryStatus;
  attemptCount: number;
  firstAttemptAt: string | null;
  lastAttemptAt: string | null;
  nextRetryAt: string | null;
  sentAt: string | null;
  failedReason: string | null;
  fcmMessageId: string | null;
}

export type NotificationRecipientResultStatus =
  'success' | 'failed' | 'no_push_target';

export interface NotificationRecipientResultDTO {
  notificationRecipientId: number;
  user: NotificationUserReferenceDTO;
  push: {
    status: NotificationRecipientResultStatus;
    successCount: number;
    failedCount: number;
  };
}

export interface NotificationScheduleResultsResponseDTO {
  results: NotificationRecipientResultDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface NotificationScheduleListResponseDTO {
  schedules: NotificationScheduleMonitorListItemDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface NotificationResendRequestDTO {
  delivery: NotificationDeliveryInputDTO;
}

export interface NotificationResendResponseDTO {
  notificationId: number;
  notificationScheduleId: number;
}
