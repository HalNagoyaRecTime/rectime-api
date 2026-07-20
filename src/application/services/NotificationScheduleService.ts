import type {
  CreateNotificationScheduleInput,
  NotificationScheduleEntity,
  NotificationScheduleListOptions,
  NotificationScheduleListResult,
} from '../../domain/entities/NotificationSchedule';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import type { INotificationScheduleService } from './INotificationScheduleService';

export function createNotificationScheduleService(
  notificationScheduleRepository: INotificationScheduleRepository
): INotificationScheduleService {
  return {
    getAllNotificationSchedules(
      options: NotificationScheduleListOptions
    ): Promise<NotificationScheduleListResult> {
      return notificationScheduleRepository.findAll(options);
    },

    async getNotificationScheduleById(
      notificationScheduleId: number
    ): Promise<NotificationScheduleEntity> {
      const schedule = await notificationScheduleRepository.findById(
        notificationScheduleId
      );
      if (!schedule) throw new Error('Notification schedule not found');
      return schedule;
    },

    async deleteNotificationSchedule(
      notificationScheduleId: number
    ): Promise<void> {
      const result = await notificationScheduleRepository.deleteDraft(
        notificationScheduleId
      );
      if (result === 'not_found') {
        throw new Error('Notification schedule not found');
      }
      if (result === 'not_draft') {
        throw new Error('Only draft notification schedules can be deleted');
      }
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
