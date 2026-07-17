import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const class_rooms = sqliteTable('class_rooms', {
  id: integer('class_room_id').primaryKey({ autoIncrement: true }),
  classCode: text('class_code').notNull(),
  name: text('class_name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const auth_users = sqliteTable('auth_users', {
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

export const users = sqliteTable('users', {
  id: integer('user_id').primaryKey({ autoIncrement: true }),
  userName: text('user_name').notNull(),
  isLiveActive: integer('is_live_active').notNull().default(1),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
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
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// staffs/teachers はまだ専用のリポジトリ層を持たない。1ユーザーにつき
// 最大1行（user_id にUNIQUE）だが、staffs と teachers は相互排他ではなく、
// 同一ユーザーが両方の行を持つことを許容する設計（ER図に相互排他を示す
// 制約は無かったため）。将来リポジトリを実装する際はこの制約を前提にすること。
export const staffs = sqliteTable('staffs', {
  id: integer('staff_id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const teachers = sqliteTable('teachers', {
  id: integer('teacher_id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const events = sqliteTable('events', {
  id: integer('event_id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  name: text('event_name').notNull(),
  ruleText: text('rule_text'),
  venue: text('venue').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
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
    .references(() => auth_users.id),
  platform: text('platform').notNull(),
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

export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const microsoft_account_links = sqliteTable('microsoft_account_links', {
  id: integer('microsoft_account_link_id').primaryKey({
    autoIncrement: true,
  }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  oid: text('oid').notNull(),
  tid: text('tid').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});
