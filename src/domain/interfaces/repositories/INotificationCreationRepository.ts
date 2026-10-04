import type {
  NotificationCreationCommand,
  NotificationCreationOutcome,
} from '../../entities/NotificationCreation';

export interface INotificationCreationRepository {
  create(
    command: NotificationCreationCommand
  ): Promise<NotificationCreationOutcome>;
}
