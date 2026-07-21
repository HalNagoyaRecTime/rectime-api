import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import type { IEventScheduleRepository } from '../../domain/interfaces/repositories/IEventScheduleRepository';
import type { IGatheringRepository } from '../../domain/interfaces/repositories/IGatheringRepository';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import { buildEventNotificationSendAt } from '../../lib/eventDate';
import type { IEventScheduleService } from './IEventScheduleService';

export function createEventScheduleService(deps: {
  eventRepository: IEventRepository;
  eventScheduleRepository: IEventScheduleRepository;
  gatheringRepository: IGatheringRepository;
  notificationScheduleRepository: INotificationScheduleRepository;
  userRepository: IUserRepository;
}): IEventScheduleService {
  const {
    eventRepository,
    eventScheduleRepository,
    gatheringRepository,
    notificationScheduleRepository,
    userRepository,
  } = deps;

  return {
    async updateEventSchedule(input) {
      const [authorized, event, gathering] = await Promise.all([
        userRepository.isStaffOrTeacher(input.user_id),
        eventRepository.findById(input.event_id),
        gatheringRepository.findByEventAndGroup(
          input.event_id,
          input.gathering_group_id
        ),
      ]);
      if (!authorized) throw new Error('Schedule update forbidden');
      if (!event) throw new Error('Event not found');
      if (!gathering) {
        throw new Error('Gathering group is not assigned to event');
      }

      const sendAt = buildEventNotificationSendAt(
        input.event_date,
        input.start_time
      );
      const title = `${event.event_name}開始のお知らせ`;
      const body = `${event.event_name}の開始時間が近づいています。該当チームは${gathering.gathering_spot_name}へ集合してください。`;

      await eventScheduleRepository.apply({
        event_id: input.event_id,
        user_id: input.user_id,
        gathering_group_id: input.gathering_group_id,
        start_time: input.start_time,
        end_time: input.end_time,
        notification_enabled: input.notification_enabled,
        notification_title: title,
        notification_body: body,
        send_at: sendAt,
      });

      const updatedEvent = await eventRepository.findById(input.event_id);
      if (!updatedEvent) throw new Error('Event not found');
      let drafts: Awaited<
        ReturnType<
          typeof notificationScheduleRepository.findDraftsByEventAndTokens
        >
      > = [];
      if (input.notification_enabled) {
        const tokenIds =
          await notificationScheduleRepository.findActiveFirebaseTokenIdsByGatheringGroup(
            input.gathering_group_id
          );
        drafts =
          await notificationScheduleRepository.findDraftsByEventAndTokens(
            input.event_id,
            tokenIds
          );
        if (tokenIds.length > 0 && drafts.length === 0) {
          throw new Error('Failed to persist draft notification schedule');
        }
      }

      return {
        event: updatedEvent,
        notification_enabled: input.notification_enabled,
        notification_schedules: drafts,
      };
    },
  };
}
