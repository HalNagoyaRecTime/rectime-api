import {
  isoDateTimeSchema,
  sendStatusSchema,
  timestampSchema,
  z,
} from '../../schemas';

export const notificationScheduleResponseSchema = z
  .object({
    notification_schedule_id: z.number().int(),
    created_user_id: z.number().int().nullable(),
    event_id: z.number().int().nullable(),
    notification_id: z.number().int(),
    firebase_token_id: z.number().int(),
    importance: z.number().int(),
    notification_type: z.string(),
    title: z.string(),
    body: z.string(),
    send_status: sendStatusSchema,
    fcm_message_id: z.string().nullable(),
    failed_reason: z.string().nullable(),
    send_at: isoDateTimeSchema,
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .openapi('NotificationSchedule');
