import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const class_rooms = sqliteTable('m_class_rooms', {
  id: integer('f_class_room_id').primaryKey({ autoIncrement: true }),
  classCode: text('f_class_code').notNull(),
  name: text('f_name').notNull(),
});

export const users = sqliteTable('m_users', {
  id: integer('f_users_id').primaryKey({ autoIncrement: true }),
  classRoomId: integer('f_class_room_id')
    .notNull()
    .references(() => class_rooms.id),
  displayName: text('f_display_name').notNull(),
  uid: text('f_uid').notNull(),
});

export const student_description = sqliteTable('m_student_description', {
  id: integer('f_student_id').primaryKey({ autoIncrement: true }),
  usersId: integer('f_users_id')
    .notNull()
    .references(() => users.id),
  attendanceNumber: integer('f_attendance_number').notNull(),
  studentIdNumber: text('f_student_id_number').notNull().unique(),
});

export const events = sqliteTable('t_events', {
  id: integer('f_event_id').primaryKey({ autoIncrement: true }),
  eventCode: text('f_event_code').notNull().unique(),
  name: text('f_event_name').notNull(),
  time: text('f_time').notNull(),
  duration: text('f_duration').notNull(),
  place: text('f_place').notNull(),
  gatherTime: text('f_gather_time').notNull(),
  summary: text('f_summary'),
});

export const entries = sqliteTable('t_entries', {
  id: integer('f_entry_id').primaryKey({ autoIncrement: true }),
  studentId: integer('f_student_id')
    .notNull()
    .references(() => student_description.id),
  eventId: integer('f_event_id')
    .notNull()
    .references(() => events.id),
});

export const notification_users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  authProvider: text('auth_provider'),
  providerUserId: text('provider_user_id'),
  email: text('email'),
  studentNumber: text('student_number').notNull().unique(),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const firebase_tokens = sqliteTable('firebase_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => notification_users.id),
  platform: text('platform', { enum: ['android', 'ios'] }).notNull(),
  fcmToken: text('fcm_token').notNull().unique(),
  isActive: integer('is_active').notNull().default(1),
  lastSeenAt: text('last_seen_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const notification_send_logs = sqliteTable('notification_send_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventId: integer('event_id')
    .notNull()
    .references(() => events.id),
  firebaseTokenId: integer('firebase_token_id')
    .notNull()
    .references(() => firebase_tokens.id),
  notificationType: text('notification_type').notNull(),
  scheduledForDate: text('scheduled_for_date').notNull(),
  fcmMessageId: text('fcm_message_id'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
