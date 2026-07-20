import { relations, sql } from 'drizzle-orm';
import {
  integer,
  index,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

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

export const gatherings = sqliteTable(
  'gatherings',
  {
    id: integer('gathering_id').primaryKey({ autoIncrement: true }),
    gatheringGroupId: integer('gathering_group_id')
      .notNull()
      .unique()
      .references(() => gathering_groups.id),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id),
    gatheringSpotId: integer('gathering_spot_id')
      .notNull()
      .references(() => gathering_spots.id),
    gatheringTime: text('gathering_time').notNull().default('99:59'),
    round: integer('round').notNull().default(99),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    index('idx_gatherings_event_id').on(table.eventId),
    index('idx_gatherings_spot_id').on(table.gatheringSpotId),
  ]
);

export const gathering_spots = sqliteTable('gathering_spots', {
  id: integer('gathering_spot_id').primaryKey({ autoIncrement: true }),
  name: text('gathering_spot_name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const gathering_groups = sqliteTable('gathering_groups', {
  id: integer('gathering_group_id').primaryKey({ autoIncrement: true }),
  name: text('gathering_group_name').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const gathering_group_members = sqliteTable(
  'gathering_group_members',
  {
    id: integer('gathering_group_member_id').primaryKey({
      autoIncrement: true,
    }),
    gatheringGroupId: integer('gathering_group_id')
      .notNull()
      .references(() => gathering_groups.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    uniqueIndex('uq_gathering_group_members_group_user').on(
      table.gatheringGroupId,
      table.userId
    ),
    index('idx_gathering_group_members_user_id').on(table.userId),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  gatheringGroupMembers: many(gathering_group_members),
}));

export const gatheringGroupsRelations = relations(
  gathering_groups,
  ({ many }) => ({
    members: many(gathering_group_members),
    gatherings: many(gatherings),
  })
);

export const gatheringSpotsRelations = relations(
  gathering_spots,
  ({ many }) => ({
    gatherings: many(gatherings),
  })
);

export const eventsRelations = relations(events, ({ many }) => ({
  gatherings: many(gatherings),
}));

export const gatheringsRelations = relations(gatherings, ({ one }) => ({
  gatheringGroup: one(gathering_groups, {
    fields: [gatherings.gatheringGroupId],
    references: [gathering_groups.id],
  }),
  event: one(events, {
    fields: [gatherings.eventId],
    references: [events.id],
  }),
  gatheringSpot: one(gathering_spots, {
    fields: [gatherings.gatheringSpotId],
    references: [gathering_spots.id],
  }),
}));

export const gatheringGroupMembersRelations = relations(
  gathering_group_members,
  ({ one }) => ({
    gatheringGroup: one(gathering_groups, {
      fields: [gathering_group_members.gatheringGroupId],
      references: [gathering_groups.id],
    }),
    user: one(users, {
      fields: [gathering_group_members.userId],
      references: [users.id],
    }),
  })
);

export const firebase_tokens = sqliteTable('firebase_tokens', {
  firebaseTokenId: integer('firebase_token_id').primaryKey({
    autoIncrement: true,
  }),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  platform: integer('platform').notNull(),
  fcmToken: text('fcm_token').notNull().unique(),
  isFirebaseActive: integer('is_firebase_active').notNull().default(1),
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

export const notification_schedules = sqliteTable(
  'notification_schedules',
  {
    id: integer('notification_send_schedule_id').primaryKey({
      autoIncrement: true,
    }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id),
    gatheringGroupId: integer('gathering_group_id')
      .notNull()
      .references(() => gathering_groups.id),
    notificationId: integer('notification_id')
      .notNull()
      .references(() => notifications.notificationId),
    importance: integer('importance').notNull().default(2),
    sendStatus: text('send_status').notNull().default('draft'),
    fcmMessageId: text('fcm_message_id').unique(),
    failedReason: text('failed_reason'),
    sendAt: text('send_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    index('idx_notification_schedules_due').on(table.sendStatus, table.sendAt),
    index('idx_notification_schedules_event_id').on(table.eventId),
    index('idx_notification_schedules_gathering_group_id').on(
      table.gatheringGroupId
    ),
  ]
);

export const notifications = sqliteTable('notifications', {
  notificationId: integer('notification_id').primaryKey({
    autoIncrement: true,
  }),
  notificationType: text('notification_type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
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
