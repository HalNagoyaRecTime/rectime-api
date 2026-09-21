import type {
  NotificationImportance,
  NotificationPushDeliveryStatus,
  NotificationScheduleStatus,
} from '../../domain/entities/Notification';
import type {
  NotificationAudienceDTO,
  NotificationContentPushDTO,
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

export interface NotificationAdminScheduleListItemDTO {
  notificationScheduleId: number;
  sendAt: string;
  status: NotificationScheduleStatus;
  scheduledBy: NotificationUserReferenceDTO | null;
  createdAt: string;
  audience: NotificationScheduleAudienceDTO;
  recipientPushSummary: NotificationRecipientPushSummaryDTO;
}

export interface NotificationScheduleListItemDTO {
  notificationId: number;
  notificationScheduleId: number;
  content: { push: NotificationContentPushDTO };
  importance: NotificationImportance;
  sendAt: string;
  status: NotificationScheduleStatus;
  stop: NotificationScheduleStopDTO | null;
  creation: NotificationCreationDTO;
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

export interface NotificationScheduleDetailDTO {
  notificationId: number;
  notificationScheduleId: number;
  content: { push: NotificationContentPushDTO };
  importance: NotificationImportance;
  sendAt: string;
  status: NotificationScheduleStatus;
  stop: NotificationScheduleStopDTO | null;
  creation: NotificationCreationDTO;
  audienceProgress: NotificationAudienceProgressDTO;
  recipientProgress: NotificationRecipientProgressDTO;
  deliveryProgress: NotificationDeliveryProgressDTO;
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

export interface NotificationRecipientResultDeliveryDTO {
  notificationPushDeliveryId: number;
  platform: 'ios' | 'android';
  status: NotificationPushDeliveryStatus;
  attemptCount: number;
  lastAttemptAt: string | null;
  sentAt: string | null;
}

export interface NotificationRecipientResultDTO {
  notificationRecipientId: number;
  user: NotificationUserReferenceDTO;
  deliveries: NotificationRecipientResultDeliveryDTO[];
}

export interface NotificationScheduleResultsPaginationDTO {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
}

export interface NotificationScheduleResultsResponseDTO {
  notificationScheduleId: number;
  recipients: {
    items: NotificationRecipientResultDTO[];
    pagination: NotificationScheduleResultsPaginationDTO;
  };
}

export interface NotificationScheduleListResponseDTO {
  items: NotificationScheduleListItemDTO[];
}

export interface NotificationResendRequestDTO {
  delivery: NotificationDeliveryInputDTO;
}

export interface NotificationResendResponseDTO {
  notificationId: number;
  notificationScheduleId: number;
}
