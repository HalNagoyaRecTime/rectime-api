import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import type { IGatheringRepository } from '../../domain/interfaces/repositories/IGatheringRepository';
import type { INotificationRepository } from '../../domain/interfaces/repositories/INotificationRepository';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import { buildEventNotificationSendAt } from '../../lib/eventDate';
import type { IEventScheduleService } from './IEventScheduleService';

export function createEventScheduleService(deps: {
  eventRepository: IEventRepository;
  gatheringRepository: IGatheringRepository;
  notificationRepository: INotificationRepository;
  notificationScheduleRepository: INotificationScheduleRepository;
}): IEventScheduleService {
  const {
    eventRepository,
    gatheringRepository,
    notificationRepository,
    notificationScheduleRepository,
  } = deps;

  return {
    async updateEventSchedule(input) {
      const [event, gathering] = await Promise.all([
        eventRepository.findById(input.event_id),
        gatheringRepository.findByEventAndGroup(
          input.event_id,
          input.gathering_group_id
        ),
      ]);
      if (!event) throw new Error('Event not found');
      if (!gathering) {
        throw new Error('Gathering group is not assigned to event');
      }

      const updatedEvent = await eventRepository.updateTimes(input.event_id, {
        start_time: input.start_time,
        end_time: input.end_time,
      });
      if (!updatedEvent) throw new Error('Event not found');

      if (!input.notification_enabled) {
        await notificationScheduleRepository.deleteDraftsByEventAndGroup(
          input.event_id,
          input.gathering_group_id
        );
        return {
          event: updatedEvent,
          notification_enabled: false,
          notification_schedule: null,
        };
      }

      const sendAt = buildEventNotificationSendAt(
        input.event_date,
        input.start_time
      );
      const title = `${updatedEvent.event_name}開始のお知らせ`;
      const body = `${updatedEvent.event_name}の開始時間が近づいています。該当チームは${gathering.gathering_spot_name}へ集合してください。`;
      const drafts =
        await notificationScheduleRepository.findDraftsByEventAndGroup(
          input.event_id,
          input.gathering_group_id
        );
      const existing = drafts[0];

      if (existing) {
        await notificationRepository.update(existing.notification_id, {
          title,
          body,
        });
        const updatedSchedule =
          await notificationScheduleRepository.updateDraft(
            existing.notification_send_schedule_id,
            {
              notification_id: existing.notification_id,
              send_at: sendAt,
            }
          );
        if (!updatedSchedule) {
          throw new Error('Draft notification schedule was changed');
        }
        await notificationScheduleRepository.deleteDraftsByEventAndGroup(
          input.event_id,
          input.gathering_group_id,
          updatedSchedule.notification_send_schedule_id
        );
        return {
          event: updatedEvent,
          notification_enabled: true,
          notification_schedule: updatedSchedule,
        };
      }

      const notification = await notificationRepository.create({
        notification_type: 'event_reminder',
        title,
        body,
      });
      const notificationSchedule = await notificationScheduleRepository.create({
        user_id: input.user_id,
        event_id: input.event_id,
        gathering_group_id: input.gathering_group_id,
        notification_id: notification.notification_id,
        importance: 2,
        send_at: sendAt,
      });
      return {
        event: updatedEvent,
        notification_enabled: true,
        notification_schedule: notificationSchedule,
      };
    },
  };
}
