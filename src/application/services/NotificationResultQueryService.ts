import { firebasePlatformToName } from '../../domain/entities/FirebaseToken';
import type {
  NotificationPushDeliveryDetail,
  NotificationResultDelivery,
  NotificationScheduleResults,
} from '../../domain/entities/NotificationResultQuery';
import type { INotificationResultQueryRepository } from '../../domain/interfaces/repositories/INotificationResultQueryRepository';
import type {
  NotificationPushDeliveryDetailDTO,
  NotificationRecipientResultDTO,
  NotificationScheduleResultsQueryDTO,
  NotificationScheduleResultsResponseDTO,
} from '../dto/NotificationScheduleDTO';
import type { INotificationResultQueryService } from './INotificationResultQueryService';

export function createNotificationResultQueryService(
  repository: INotificationResultQueryRepository
): INotificationResultQueryService {
  return {
    async getScheduleResults(notificationScheduleId, query) {
      const result = await repository.findScheduleResults(
        notificationScheduleId,
        {
          page: query.page,
          limit: query.limit,
        }
      );
      return result ? toResultsDTO(result, query) : null;
    },

    async getPushDeliveryDetail(notificationPushDeliveryId) {
      const detail = await repository.findPushDeliveryById(
        notificationPushDeliveryId
      );
      return detail ? toDeliveryDetailDTO(detail) : null;
    },
  };
}

function toResultsDTO(
  result: NotificationScheduleResults,
  query: NotificationScheduleResultsQueryDTO
): NotificationScheduleResultsResponseDTO {
  return {
    notificationScheduleId: result.notification_schedule_id,
    recipients: {
      items: result.recipients.map(toRecipientDTO),
      pagination: {
        page: query.page,
        limit: query.limit,
        totalCount: result.total_count,
        totalPages: Math.ceil(result.total_count / query.limit),
      },
    },
  };
}

function toRecipientDTO(
  recipient: NotificationScheduleResults['recipients'][number]
): NotificationRecipientResultDTO {
  return {
    notificationRecipientId: recipient.notification_recipient_id,
    user: {
      userId: recipient.user_id,
      userName: recipient.user_name,
    },
    deliveries: recipient.deliveries.map(toDeliveryDTO),
  };
}

function toDeliveryDTO(
  delivery: NotificationResultDelivery
): NotificationRecipientResultDTO['deliveries'][number] {
  return {
    notificationPushDeliveryId: delivery.notification_push_delivery_id,
    platform: firebasePlatformToName(delivery.platform),
    status: delivery.status,
    attemptCount: delivery.attempt_count,
    lastAttemptAt: delivery.last_attempt_at,
    sentAt: delivery.sent_at,
  };
}

function toDeliveryDetailDTO(
  detail: NotificationPushDeliveryDetail
): NotificationPushDeliveryDetailDTO {
  return {
    notificationPushDeliveryId: detail.notification_push_delivery_id,
    notificationRecipientId: detail.notification_recipient_id,
    firebaseTokenId: detail.firebase_token_id,
    platform: firebasePlatformToName(detail.platform),
    status: detail.status,
    attemptCount: detail.attempt_count,
    firstAttemptAt: detail.first_attempt_at,
    lastAttemptAt: detail.last_attempt_at,
    nextRetryAt: detail.next_retry_at,
    sentAt: detail.sent_at,
    failedReason: detail.failed_reason,
    fcmMessageId: detail.fcm_message_id,
  };
}
