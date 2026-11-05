import type { FirebasePlatformName } from '../../domain/entities/FirebaseToken';
import type {
  NotificationImportance,
  NotificationPushDeliveryStatus,
  NotificationRecipientResolutionStatus,
  NotificationScheduleStatus,
} from '../../domain/entities/Notification';
import type {
  NotificationAudienceDTO,
  NotificationContentPushOnlyDTO,
  NotificationCreationDTO,
  NotificationDeliveryInputDTO,
  NotificationScheduleStopDTO,
  NotificationUserReferenceDTO,
} from './AdminNotificationDTO';

export interface NotificationRecipientResolutionDTO {
  status: NotificationRecipientResolutionStatus;
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

export type AdminNotificationScheduleListItemDTO = Omit<
  NotificationScheduleSummaryDTO,
  'stop'
>;

export interface NotificationScheduleBaseDTO {
  notificationId: number;
  notificationScheduleId: number;
  content: NotificationContentPushOnlyDTO;
  importance: NotificationImportance;
  sendAt: string;
  status: NotificationScheduleStatus;
  failureReason: string | null;
  stop: NotificationScheduleStopDTO | null;
  creation: NotificationCreationDTO;
}

export type NotificationScheduleListItemDTO = NotificationScheduleBaseDTO;

export interface NotificationAudienceProgressDTO {
  totalCount: number;
  resolvedCount: number;
}

export interface NotificationRecipientProgressDTO {
  count: number;
  status: NotificationRecipientResolutionStatus;
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

export interface NotificationScheduleDetailDTO extends NotificationScheduleBaseDTO {
  audienceProgress: NotificationAudienceProgressDTO;
  recipientProgress: NotificationRecipientProgressDTO;
  deliveryProgress: NotificationDeliveryProgressDTO;
}

export interface NotificationPushDeliveryDetailDTO {
  notificationPushDeliveryId: number;
  notificationRecipientId: number;
  firebaseTokenId: number | null;
  platform: FirebasePlatformName;
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
  platform: FirebasePlatformName;
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

export interface NotificationScheduleResultsQueryDTO {
  page: number;
  limit: number;
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
