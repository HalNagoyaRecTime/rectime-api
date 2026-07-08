import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const class_rooms = sqliteTable('class_rooms', {
  id: integer('class_room_id').primaryKey({ autoIncrement: true }),
  classCode: text('class_code').notNull(),
  name: text('class_name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const auth_users = sqliteTable('auth_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  authProvider: text('auth_provider'),
  providerUserId: text('provider_user_id'),
  email: text('email'),
  studentNumber: text('student_number').notNull().unique(),
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const users = sqliteTable('users', {
  id: integer('user_id').primaryKey({ autoIncrement: true }),
  userName: text('user_name').notNull(),
  isLiveActive: integer('is_live_active').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const students = sqliteTable('students', {
  id: integer('student_id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  classRoomId: integer('class_room_id')
    .notNull()
    .references(() => class_rooms.id),
  attendanceNumber: integer('attendance_number').notNull(),
  studentIdNumber: text('student_id_number').notNull().unique(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
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
