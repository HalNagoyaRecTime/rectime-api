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
