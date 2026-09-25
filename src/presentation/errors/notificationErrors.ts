import { NotificationContractErrors } from './notificationContractErrors';
import { NotificationLegacyErrors } from './notificationLegacyErrors';

export const NotificationErrors = {
  ...NotificationContractErrors,
  ...NotificationLegacyErrors,
} as const;
