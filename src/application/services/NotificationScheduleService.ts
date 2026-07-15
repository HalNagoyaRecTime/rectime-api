import type {
  CreateNotificationScheduleInput,
  NotificationScheduleEntity,
} from '../../domain/entities/NotificationSchedule';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import type { INotificationScheduleService } from './INotificationScheduleService';

export function createNotificationScheduleService(
  notificationScheduleRepository: INotificationScheduleRepository
): INotificationScheduleService {
  return {
    getAllNotificationSchedules(): Promise<NotificationScheduleEntity[]> {
      return notificationScheduleRepository.findAll();
    },

    async createNotificationSchedule(
      input: CreateNotificationScheduleInput
    ): Promise<NotificationScheduleEntity> {
      if (!(await notificationScheduleRepository.existsUser(input.user_id))) {
        throw new Error('User not found');
      }
      if (
        !(await notificationScheduleRepository.existsEventGatheringGroup(
          input.event_id,
          input.gathering_group_id
        ))
      ) {
        throw new Error('Gathering group is not assigned to event');
      }
      if (
        !(await notificationScheduleRepository.existsNotification(
          input.notification_id
        ))
      ) {
        throw new Error('Notification not found');
      }
      return notificationScheduleRepository.create(input);
    },
  };
}
