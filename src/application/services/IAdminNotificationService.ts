import type {
  AdminNotificationCreationResult,
  CreateAdminNotificationInput,
} from '../../domain/entities/AdminNotification';

export interface IAdminNotificationService {
  canCreateManualNotification(userId: number): Promise<boolean>;
  createManualNotification(
    input: CreateAdminNotificationInput
  ): Promise<AdminNotificationCreationResult>;
}
