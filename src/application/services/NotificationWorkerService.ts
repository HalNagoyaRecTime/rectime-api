import type { NotificationWorkerMessage } from '../../domain/entities/NotificationWorkerMessage';
import type { INotificationWorkerQueue } from '../../domain/interfaces/queues/INotificationWorkerQueue';
import type { INotificationAudienceResolverRepository } from '../../domain/interfaces/repositories/INotificationAudienceResolverRepository';
import type { INotificationPushDeliveryRepository } from '../../domain/interfaces/repositories/INotificationPushDeliveryRepository';
import type { INotificationAudienceResolverService } from './INotificationAudienceResolverService';
import type { INotificationPushDeliveryService } from './INotificationPushDeliveryService';
import type { INotificationRetryService } from './INotificationRetryService';
import type {
  INotificationWorkerService,
  NotificationWorkerScheduleResult,
} from './INotificationWorkerService';
import {
  NOTIFICATION_WORKER_MESSAGE_SIZE,
  NOTIFICATION_WORKER_SCHEDULE_LIMIT,
} from '../../domain/entities/NotificationWorkerMessage';

export function createNotificationWorkerService(deps: {
  audienceResolverRepository: INotificationAudienceResolverRepository;
  pushDeliveryRepository: INotificationPushDeliveryRepository;
  audienceResolverService: INotificationAudienceResolverService;
  pushDeliveryService: INotificationPushDeliveryService;
  retryService: INotificationRetryService;
  queue: INotificationWorkerQueue;
}): INotificationWorkerService {
  const {
    audienceResolverRepository,
    pushDeliveryRepository,
    audienceResolverService,
    pushDeliveryService,
    retryService,
    queue,
  } = deps;

  return {
    async enqueueDueSchedules(now = new Date()) {
      const scheduleIds = await audienceResolverRepository.findDueScheduleIds(
        now.toISOString(),
        NOTIFICATION_WORKER_SCHEDULE_LIMIT
      );
      const messages: NotificationWorkerMessage[] = [];
      for (
        let offset = 0;
        offset < scheduleIds.length;
        offset += NOTIFICATION_WORKER_MESSAGE_SIZE
      ) {
        messages.push({
          notificationScheduleIds: scheduleIds.slice(
            offset,
            offset + NOTIFICATION_WORKER_MESSAGE_SIZE
          ),
        });
      }
      if (messages.length > 0) await queue.enqueueMany(messages);
      return {
        queuedSchedules: scheduleIds.length,
        queuedMessages: messages.length,
      };
    },

    async processSchedule(
      scheduleId,
      now = new Date()
    ): Promise<NotificationWorkerScheduleResult> {
      const resolution = await audienceResolverService.resolveSchedule(
        scheduleId,
        now
      );
      const generation = await pushDeliveryService.generateDeliveries(
        scheduleId,
        now
      );
      const deliveryIds = await pushDeliveryRepository.findPendingDeliveryIds(
        scheduleId,
        5000
      );
      const result: NotificationWorkerScheduleResult = {
        resolved: resolution.status === 'resolved',
        generated: generation.status === 'generated',
        sent: 0,
        retryWait: 0,
        failed: 0,
      };
      for (const deliveryId of deliveryIds) {
        const delivery = await pushDeliveryService.sendDelivery(
          deliveryId,
          now
        );
        if (delivery.status === 'sent') result.sent += 1;
        if (delivery.status === 'retry_wait') result.retryWait += 1;
        if (delivery.status === 'failed') result.failed += 1;
      }
      return result;
    },

    retryDueDeliveries(now, limit) {
      return retryService.retryDueDeliveries(now, limit);
    },

    recoverProcessingTimeouts(now, limit) {
      return retryService.recoverProcessingTimeouts(now, limit);
    },
  };
}
