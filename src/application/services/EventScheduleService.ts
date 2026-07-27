import type { IEventRepository } from '../../domain/interfaces/repositories/IEventRepository';
import type { IEventScheduleRepository } from '../../domain/interfaces/repositories/IEventScheduleRepository';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import { buildEventNotificationSendAt } from '../../lib/eventDate';
import type { IEventScheduleService } from './IEventScheduleService';

export function createEventScheduleService(deps: {
  eventRepository: IEventRepository;
  eventScheduleRepository: IEventScheduleRepository;
  notificationScheduleRepository: INotificationScheduleRepository;
  userRepository: IUserRepository;
}): IEventScheduleService {
  const {
    eventRepository,
    eventScheduleRepository,
    notificationScheduleRepository,
    userRepository,
  } = deps;

  return {
    async updateEventSchedule(input) {
      const [authorized, event] = await Promise.all([
        userRepository.isStaffOrTeacher(input.user_id),
        eventRepository.findById(input.event_id),
      ]);
      if (!authorized) throw new Error('Schedule update forbidden');
      if (!event) throw new Error('Event not found');

      const sendAt = buildEventNotificationSendAt(
        input.event_date,
        input.start_time
      );
      await eventScheduleRepository.apply({
        event_id: input.event_id,
        user_id: input.user_id,
        event_name: input.event_name ?? event.event_name,
        rule_text:
          input.rule_text === undefined ? event.rule_text : input.rule_text,
        venue: input.venue ?? event.venue,
        start_time: input.start_time,
        end_time: input.end_time,
        notification_enabled: input.notification_enabled,
        send_at: sendAt,
      });

      const updatedEvent = await eventRepository.findById(input.event_id);
      if (!updatedEvent) throw new Error('Event not found');
      const drafts = input.notification_enabled
        ? await notificationScheduleRepository.findDraftsByEvent(input.event_id)
        : [];

      return {
        event: updatedEvent,
        notification_enabled: input.notification_enabled,
        notification_schedules: drafts,
      };
    },

    async getEventNotificationSummary(eventId, userId) {
      const [authorized, event] = await Promise.all([
        userRepository.isStaffOrTeacher(userId),
        eventRepository.findById(eventId),
      ]);
      if (!authorized) throw new Error('Schedule update forbidden');
      if (!event) throw new Error('Event not found');

      return {
        event_id: eventId,
        ...(await eventScheduleRepository.getNotificationSummary(eventId)),
      };
    },
  };
}
