import type {
  AdminNotificationSnapshot,
  CreateNotificationCommand,
  CreateNotificationResult,
  NotificationAudienceTarget,
  NotificationDeleteResult,
  NotificationMutationResult,
  NotificationMutationSnapshot,
  UpdateNotificationCommand,
} from '../../entities/AdminNotificationCommand';

export interface IAdminNotificationCommandRepository {
  areAudienceTargetsAvailable(
    targets: NotificationAudienceTarget[]
  ): Promise<boolean>;
  create(command: CreateNotificationCommand): Promise<CreateNotificationResult>;
  findMutationSnapshot(
    notificationId: number
  ): Promise<NotificationMutationSnapshot | null>;
  update(
    command: UpdateNotificationCommand
  ): Promise<NotificationMutationResult>;
  deleteUnstartedManual(
    notificationId: number
  ): Promise<NotificationDeleteResult>;
  findDetail(notificationId: number): Promise<AdminNotificationSnapshot | null>;
}
