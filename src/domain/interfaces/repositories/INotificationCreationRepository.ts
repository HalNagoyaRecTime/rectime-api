import type {
  AutomaticNotificationCreationCommand,
  NotificationCreationCommand,
  NotificationCreationOutcome,
} from '../../entities/NotificationCreation';

export interface INotificationCreationRepository {
  create(
    command: NotificationCreationCommand
  ): Promise<NotificationCreationOutcome>;
  createOrUpdateAutomatic(
    command: AutomaticNotificationCreationCommand
  ): Promise<NotificationCreationOutcome>;
}
