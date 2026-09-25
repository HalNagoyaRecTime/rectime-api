import type {
  AdminNotificationCreationResult,
  CreateAdminNotificationInput,
} from '../../domain/entities/AdminNotification';

export interface IAdminNotificationService {
  createManualNotification(
    input: CreateAdminNotificationInput
  ): Promise<AdminNotificationCreationResult>;
}
