import {
  CreateManualNotificationInput,
  ManualNotificationEntity,
} from '../../entities/ManualNotification';

export interface IManualNotificationRepository {
  create: (
    input: Pick<CreateManualNotificationInput, 'title' | 'body'>
  ) => Promise<ManualNotificationEntity>;
}
