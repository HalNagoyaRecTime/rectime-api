import {
  NOTIFICATION_IMPORTANCE_LEVELS,
  isNotificationImportanceAllowed,
} from '../../domain/entities/Notification';
import type { INotificationConfigRepository } from '../../domain/interfaces/repositories/INotificationConfigRepository';
import type {
  NotificationAudienceCountRequestDTO,
  NotificationAudienceCountResponseDTO,
  NotificationConfigDTO,
} from '../dto/AdminNotificationDTO';
import { toAudienceTargets } from './NotificationAudienceTargets';

export type NotificationConfigErrorCode = 'NOTIFICATION_AUDIENCE_NOT_FOUND';

export class NotificationConfigError extends Error {
  constructor(readonly code: NotificationConfigErrorCode) {
    super(code);
    this.name = 'NotificationConfigError';
  }
}

export interface NotificationConfigService {
  getConfig(): NotificationConfigDTO;
  countAudience(
    request: NotificationAudienceCountRequestDTO
  ): Promise<NotificationAudienceCountResponseDTO>;
}

export function createNotificationConfigService(
  repository: INotificationConfigRepository
): NotificationConfigService {
  return {
    getConfig() {
      return {
        importance: {
          default: 'normal',
          options: NOTIFICATION_IMPORTANCE_LEVELS.filter(
            isNotificationImportanceAllowed
          ),
        },
      };
    },

    async countAudience(request) {
      const targets = toAudienceTargets(request.audience.items);
      if (!(await repository.areAudienceTargetsAvailable(targets))) {
        throw new NotificationConfigError('NOTIFICATION_AUDIENCE_NOT_FOUND');
      }
      return {
        recipientCount: await repository.countAudienceUsers(targets),
      };
    },
  };
}
