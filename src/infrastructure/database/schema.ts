import { relations, sql } from 'drizzle-orm';
import {
  check,
  integer,
  index,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const class_rooms = sqliteTable(
  'class_rooms',
  {
    id: integer('class_room_id').primaryKey({ autoIncrement: true }),
    classCode: text('class_code').notNull(),
    name: text('class_name').notNull(),
    // 1クラスの担当教員は最大1人という運用前提のカラム。クラス作成時点では
    // 未定のこともあるためNULLを許容する。逆方向（1人の教員が複数クラスを
    // 担当すること）は許容するため、UNIQUE制約は付けない。
    teacherId: integer('teacher_id').references(() => teachers.id),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    uniqueIndex('uq_class_rooms_class_code').on(table.classCode),
    index('idx_class_rooms_teacher_id').on(table.teacherId),
  ]
);

export const users = sqliteTable(
  'users',
  {
    id: integer('user_id').primaryKey({ autoIncrement: true }),
    userName: text('user_name').notNull(),
    isLiveActive: integer('is_live_active').notNull().default(1),
    // 本人によるアカウント削除(#265)の状態。管理上の一時無効化を表す
    // isLiveActiveとは独立した軸で、'active'以外になったユーザーは
    // 学生の再登録復元(#262)の対象から除外する。
    deletionStatus: text('deletion_status')
      .notNull()
      .default('active')
      .$type<'active' | 'deletion_pending' | 'deleted'>(),
    deletionRequestedAt: text('deletion_requested_at'),
    // 削除を受け付けた時刻。deletionStatusが'deleted'になった時点で
    // セットされる(＝関連データの削除・匿名化はまだ完了していないかも
    // しれない)。
    deletedAt: text('deleted_at'),
    // 関連データの削除・匿名化(後片付け)が完了した時刻。deletedAtとの
    // 差分がこの2軸の意味: deletedAtは「削除を受け付けた」時刻、purgedAtは
    // 「後片付けまで完了した」時刻。後片付けはFirebase Token・通知・
    // ロール・所属など複数テーブルへの個別の書き込みで構成され、単一の
    // トランザクションにはできないため、`deletionStatus = 'deleted' AND
    // purgedAt IS NULL`で途中失敗した利用者を機械的に抽出・再実行できる
    // ようにする(AccountDeletionService.deleteRelatedData参照)。
    purgedAt: text('purged_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [index('idx_users_deletion_status').on(table.deletionStatus)]
);

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

export const teachers = sqliteTable(
  'teachers',
  {
    id: integer('teacher_id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id)
      .unique(),
    // Microsoftアカウントとの突合キー。
    email: text('email').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [uniqueIndex('uq_teachers_email').on(table.email)]
);

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

export const gathering_group_members = sqliteTable(
  'gathering_group_members',
  {
    id: integer('gathering_group_member_id').primaryKey({
      autoIncrement: true,
    }),
    gatheringId: integer('gathering_id')
      .notNull()
      .references(() => gatherings.id),
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
    uniqueIndex('uq_gathering_group_members_gathering_user').on(
      table.gatheringId,
      table.userId
    ),
    index('idx_gathering_group_members_user_id').on(table.userId),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  gatheringGroupMembers: many(gathering_group_members),
}));

export const gatheringSpotsRelations = relations(
  gathering_spots,
  ({ many }) => ({
    gatherings: many(gatherings),
  })
);

export const eventsRelations = relations(events, ({ many }) => ({
  gatherings: many(gatherings),
}));

export const gatheringsRelations = relations(gatherings, ({ one, many }) => ({
  members: many(gathering_group_members),
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
    gathering: one(gatherings, {
      fields: [gathering_group_members.gatheringId],
      references: [gatherings.id],
    }),
    user: one(users, {
      fields: [gathering_group_members.userId],
      references: [users.id],
    }),
  })
);

export const firebase_tokens = sqliteTable(
  'firebase_tokens',
  {
    firebaseTokenId: integer('firebase_token_id').primaryKey({
      autoIncrement: true,
    }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    platform: integer('platform').notNull(),
    fcmToken: text('fcm_token').notNull(),
    // #460でactive flagを削除するまで、旧Workerとのexpand互換用に残す。
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
  },
  table => [
    uniqueIndex('idx_firebase_tokens_active_fcm_token')
      .on(table.fcmToken)
      .where(sql`${table.isFirebaseActive} = 1`),
    index('idx_firebase_tokens_active').on(table.isFirebaseActive),
  ]
);

export const notification_schedules = sqliteTable(
  'notification_schedules',
  {
    id: integer('notification_schedule_id').primaryKey({
      autoIncrement: true,
    }),
    createdUserId: integer('created_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    scheduledByUserId: integer('scheduled_by_user_id').references(
      () => users.id,
      { onDelete: 'set null' }
    ),
    eventId: integer('event_id').references(() => events.id, {
      onDelete: 'set null',
    }),
    notificationId: integer('notification_id')
      .notNull()
      .references(() => notifications.notificationId, { onDelete: 'cascade' }),
    firebaseTokenId: integer('firebase_token_id').references(
      () => firebase_tokens.firebaseTokenId,
      {
        onDelete: 'set null',
      }
    ),
    importance: integer('importance').notNull().default(2),
    // #460で旧defaultと旧statusを整理するまでexpand互換用に残す。
    sendStatus: text('send_status').notNull().default('draft'),
    fcmMessageId: text('fcm_message_id'),
    failedReason: text('failed_reason'),
    sendAt: text('send_at').notNull(),
    recipientsResolvedAt: text('recipients_resolved_at'),
    startedAt: text('started_at'),
    completedAt: text('completed_at'),
    stoppedAt: text('stopped_at'),
    stoppedByUserId: integer('stopped_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
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
    index('idx_notification_schedules_notification_id').on(
      table.notificationId
    ),
    index('idx_notification_schedules_firebase_token_id').on(
      table.firebaseTokenId
    ),
  ]
);

export const notifications = sqliteTable(
  'notifications',
  {
    notificationId: integer('notification_id').primaryKey({
      autoIncrement: true,
    }),
    createdByUserId: integer('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    pushTitle: text('push_title').notNull().default(''),
    pushBody: text('push_body').notNull().default(''),
    // #460で旧Mobile・旧Admin経路の互換列を削除する。
    notificationType: text('notification_type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    importance: integer('importance').notNull().default(2),
    sourceType: text('source_type'),
    sourceId: integer('source_id'),
    sourceHash: text('source_hash'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    check(
      'ck_notifications_source_columns',
      sql`(
      (${table.sourceType} IS NULL AND ${table.sourceId} IS NULL AND ${table.sourceHash} IS NULL)
      OR (${table.sourceType} IS NOT NULL AND ${table.sourceId} IS NOT NULL AND ${table.sourceHash} IS NOT NULL)
    )`
    ),
    uniqueIndex('uq_notifications_source').on(
      table.sourceType,
      table.sourceId,
      table.notificationType,
      table.sourceHash
    ),
  ]
);

export const notification_audiences = sqliteTable(
  'notification_audiences',
  {
    id: integer('notification_audience_id').primaryKey({
      autoIncrement: true,
    }),
    notificationScheduleId: integer('notification_schedule_id')
      .notNull()
      .references(() => notification_schedules.id, { onDelete: 'cascade' }),
    audienceType: text('audience_type').notNull(),
    targetId: integer('target_id'),
    resolvedAt: text('resolved_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    check(
      'ck_notification_audiences_target',
      sql`(
        (${table.audienceType} = 'all' AND ${table.targetId} IS NULL)
        OR (${table.audienceType} <> 'all' AND ${table.targetId} IS NOT NULL)
      )`
    ),
    uniqueIndex('uq_notification_audiences_schedule_target').on(
      table.notificationScheduleId,
      table.audienceType,
      table.targetId
    ),
    uniqueIndex('uq_notification_audiences_schedule_all')
      .on(table.notificationScheduleId)
      .where(sql`${table.audienceType} = 'all'`),
  ]
);

export const notification_recipients = sqliteTable(
  'notification_recipients',
  {
    id: integer('notification_recipient_id').primaryKey({
      autoIncrement: true,
    }),
    notificationScheduleId: integer('notification_schedule_id')
      .notNull()
      .references(() => notification_schedules.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    uniqueIndex('uq_notification_recipients_schedule_user').on(
      table.notificationScheduleId,
      table.userId
    ),
    index('idx_notification_recipients_user_id').on(table.userId),
  ]
);

export const notification_push_deliveries = sqliteTable(
  'notification_push_deliveries',
  {
    id: integer('notification_push_delivery_id').primaryKey({
      autoIncrement: true,
    }),
    notificationRecipientId: integer('notification_recipient_id')
      .notNull()
      .references(() => notification_recipients.id, { onDelete: 'cascade' }),
    firebaseTokenId: integer('firebase_token_id').references(
      () => firebase_tokens.firebaseTokenId,
      { onDelete: 'set null' }
    ),
    platform: integer('platform').notNull(),
    status: text('status').notNull().default('pending'),
    attemptCount: integer('attempt_count').notNull().default(0),
    firstAttemptAt: text('first_attempt_at'),
    lastAttemptAt: text('last_attempt_at'),
    nextRetryAt: text('next_retry_at'),
    failedReason: text('failed_reason'),
    fcmMessageId: text('fcm_message_id'),
    sentAt: text('sent_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`CURRENT_TIMESTAMP`),
  },
  table => [
    uniqueIndex('uq_notification_push_deliveries_recipient_token')
      .on(table.notificationRecipientId, table.firebaseTokenId)
      .where(sql`${table.firebaseTokenId} IS NOT NULL`),
    index('idx_notification_push_deliveries_retry').on(
      table.status,
      table.nextRetryAt
    ),
  ]
);

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
