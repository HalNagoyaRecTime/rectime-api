import { firebasePlatformToName } from '../../domain/entities/FirebaseToken';
import type { INotificationPushDeliveryRepository } from '../../domain/interfaces/repositories/INotificationPushDeliveryRepository';
import type { IFcmService } from './IFcmService';
import type {
  INotificationPushDeliveryService,
  NotificationDeliveryGenerationResult,
  NotificationDeliverySendResult,
} from './INotificationPushDeliveryService';

export function createNotificationPushDeliveryService(deps: {
  repository: INotificationPushDeliveryRepository;
  fcmService: IFcmService;
}): INotificationPushDeliveryService {
  const { repository, fcmService } = deps;

  return {
    async generateDeliveries(
      scheduleId,
      now = new Date()
    ): Promise<NotificationDeliveryGenerationResult> {
      const allowed = await repository.isDeliveryGenerationAllowed(scheduleId);
      if (!allowed) {
        return { status: 'skipped', createdCount: 0 };
      }

      const nowIso = now.toISOString();
      try {
        const createdCount =
          await repository.createPendingDeliveries(scheduleId);
        await repository.markScheduleSending(scheduleId, nowIso);
        return { status: 'generated', createdCount };
      } catch (error) {
        await repository.markScheduleFailed(
          scheduleId,
          toErrorMessage(error),
          nowIso
        );
        throw error;
      }
    },

    async sendDelivery(
      deliveryId,
      now = new Date()
    ): Promise<NotificationDeliverySendResult> {
      const nowIso = now.toISOString();
      const target = await repository.claimPendingDelivery(deliveryId, nowIso);
      if (!target) {
        return { status: 'skipped', scheduleCompleted: false };
      }

      let result;
      try {
        result = await fcmService.sendNotificationToToken({
          token: target.fcmToken,
          platform: firebasePlatformToName(target.platform),
          title: target.title,
          body: target.body,
          importance: target.importance,
          data: buildFcmData(target),
        });
      } catch (error) {
        await repository.markDeliveryFailed(
          deliveryId,
          toErrorMessage(error),
          nowIso
        );
        const scheduleCompleted = await repository.completeScheduleIfIdle(
          target.scheduleId,
          nowIso
        );
        return { status: 'failed', scheduleCompleted };
      }

      await repository.markDeliverySent(deliveryId, result.messageId, nowIso);
      const scheduleCompleted = await repository.completeScheduleIfIdle(
        target.scheduleId,
        nowIso
      );
      return { status: 'sent', scheduleCompleted };
    },
  };
}

function buildFcmData(target: {
  notificationType: string;
  notificationId: number;
  eventId: number | null;
}): Record<string, string> {
  return {
    type: toFcmNotificationType(target.notificationType),
    ...(target.notificationType === 'manual'
      ? { notificationId: String(target.notificationId) }
      : {}),
    ...(target.eventId == null ? {} : { eventId: String(target.eventId) }),
  };
}

function toFcmNotificationType(notificationType: string): string {
  // DBの通知種別とFCM payloadの表現を分離する境界。Phase 1で同名の
  // 種別はそのまま渡し、将来のクライアント向け変換をここへ集約する。
  return notificationType;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
