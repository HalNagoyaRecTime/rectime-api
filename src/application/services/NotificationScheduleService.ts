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
      // 各存在確認は互いに独立しているため並行実行し、D1への往復回数分の
      // 待ち時間が直列に積み上がらないようにする。エラーの優先順位は
      // 従来どおり user → event → token → token-event関連 → notification。
      const [
        userExists,
        eventExists,
        firebaseTokenExists,
        firebaseTokenGatheringForEventExists,
        notificationExists,
      ] = await Promise.all([
        notificationScheduleRepository.existsUser(input.created_user_id),
        notificationScheduleRepository.existsEvent(input.event_id),
        notificationScheduleRepository.existsFirebaseToken(
          input.firebase_token_id
        ),
        notificationScheduleRepository.existsFirebaseTokenGatheringForEvent(
          input.event_id,
          input.firebase_token_id
        ),
        notificationScheduleRepository.existsNotification(
          input.notification_id
        ),
      ]);

      if (!userExists) throw new Error('User not found');
      if (!eventExists) throw new Error('Event not found');
      if (!firebaseTokenExists) throw new Error('Firebase token not found');
      if (!firebaseTokenGatheringForEventExists) {
        throw new Error(
          'Firebase token is not associated with a gathering for this event'
        );
      }
      if (!notificationExists) throw new Error('Notification not found');

      return notificationScheduleRepository.create(input);
    },
  };
}
