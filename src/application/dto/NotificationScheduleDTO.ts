import type {
  NotificationPushDeliveryStatus,
  NotificationScheduleStatus,
} from '../../domain/entities/NotificationV3';
import type {
  NotificationAudienceDTO,
  NotificationScheduleStopDTO,
  NotificationUserReferenceDTO,
} from './AdminNotificationDTO';

export interface NotificationRecipientResolutionDTO {
  status: 'pending' | 'resolved';
  resolvedCount: number;
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
  audience: NotificationAudienceDTO & {
    recipientResolution: NotificationRecipientResolutionDTO;
  };
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

export interface NotificationScheduleDetailDTO
  extends NotificationScheduleSummaryDTO {
  updatedAt: string;
  progress: NotificationScheduleProgressDTO;
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

export interface NotificationScheduleResultsResponseDTO {
  results: NotificationPushDeliveryDetailDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface NotificationScheduleListResponseDTO {
  schedules: NotificationScheduleSummaryDTO[];
  total: number;
  limit: number;
  offset: number;
}

export interface NotificationResendResponseDTO {
  notificationId: number;
  notificationScheduleId: number;
}
