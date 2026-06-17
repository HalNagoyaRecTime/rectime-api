import { D1Database } from '@cloudflare/workers-types';
import {
  CreateNotificationInput,
  NotificationRepositoryFunctions,
} from '../types/repositories';
import {
  NotificationEntity,
  NotificationListOptions,
  NotificationListResult,
  NotificationReadAllResult,
  NotificationReadStatus,
  NotificationReadResult,
} from '../types/domains';

function toNotificationEntity(
  row: Record<string, unknown>
): NotificationEntity {
  return {
    id: row.id as number,
    user_id: row.user_id as number | null,
    type: row.type as string,
    title: row.title as string,
    body: row.body as string,
    link_url: row.link_url as string | null,
    resource_type: row.resource_type as string | null,
    resource_id: row.resource_id as string | null,
    severity: row.severity as string,
    send_status: row.send_status as string,
    sent_at: row.sent_at as string | null,
    read_at: row.read_at as string | null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  };
}

function getReadStatusCondition(readStatus: NotificationReadStatus): string {
  if (readStatus === 'read') {
    return 'AND n.read_at IS NOT NULL';
  }

  if (readStatus === 'unread') {
    return 'AND n.read_at IS NULL';
  }

  return '';
}

function toReadResult(row: Record<string, unknown>): NotificationReadResult {
  return {
    notification_id: row.id as number,
    is_read: true,
    read_at: row.read_at as string,
  };
}

export function createNotificationRepository(
  db: D1Database
): NotificationRepositoryFunctions {
  const countUnreadByStudentNumber = async (
    studentNumber: string
  ): Promise<number> => {
    const row = await db
      .prepare(
        `
        SELECT COUNT(*) AS unread_count
        FROM notifications n
        INNER JOIN users u
          ON u.id = n.user_id
        WHERE u.student_number = ?
          AND u.is_active = 1
          AND n.read_at IS NULL
        `
      )
      .bind(studentNumber)
      .first<Record<string, unknown>>();

    return Number(row?.unread_count ?? 0);
  };

  return {
    async create(input: CreateNotificationInput): Promise<NotificationEntity> {
      const row = await db
        .prepare(
          `
          INSERT INTO notifications (
            user_id,
            type,
            title,
            body,
            link_url,
            resource_type,
            resource_id,
            severity,
            send_status,
            sent_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          RETURNING *
          `
        )
        .bind(
          input.userId,
          input.type,
          input.title,
          input.body,
          input.linkUrl ?? null,
          input.resourceType ?? null,
          input.resourceId ?? null,
          input.severity ?? 'info',
          input.sendStatus ?? 'sent',
          input.sentAt ?? null
        )
        .first<Record<string, unknown>>();

      if (!row) {
        throw new Error('Failed to create notification');
      }

      return toNotificationEntity(row);
    },

    async findAllByStudentNumber(
      options: NotificationListOptions
    ): Promise<NotificationListResult> {
      const readStatusCondition = getReadStatusCondition(options.readStatus);
      const countRow = await db
        .prepare(
          `
          SELECT COUNT(*) AS total
          FROM notifications n
          INNER JOIN users u
            ON u.id = n.user_id
          WHERE u.student_number = ?
            AND u.is_active = 1
            ${readStatusCondition}
          `
        )
        .bind(options.studentNumber)
        .first<Record<string, unknown>>();

      const result = await db
        .prepare(
          `
          SELECT n.*
          FROM notifications n
          INNER JOIN users u
            ON u.id = n.user_id
          WHERE u.student_number = ?
            AND u.is_active = 1
            ${readStatusCondition}
          ORDER BY n.created_at DESC, n.id DESC
          LIMIT ? OFFSET ?
          `
        )
        .bind(options.studentNumber, options.limit, options.offset)
        .all<Record<string, unknown>>();

      return {
        notifications: result.results.map(toNotificationEntity),
        total: Number(countRow?.total ?? 0),
        limit: options.limit,
        offset: options.offset,
      };
    },

    countUnreadByStudentNumber,

    async markAsRead(
      studentNumber: string,
      notificationId: number
    ): Promise<NotificationReadResult | null> {
      const existing = await db
        .prepare(
          `
          SELECT n.id, n.read_at
          FROM notifications n
          INNER JOIN users u
            ON u.id = n.user_id
          WHERE n.id = ?
            AND u.student_number = ?
            AND u.is_active = 1
          `
        )
        .bind(notificationId, studentNumber)
        .first<Record<string, unknown>>();

      if (!existing) {
        return null;
      }

      if (existing.read_at) {
        return toReadResult(existing);
      }

      const updated = await db
        .prepare(
          `
          UPDATE notifications
          SET read_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
            AND read_at IS NULL
          RETURNING id, read_at
          `
        )
        .bind(notificationId)
        .first<Record<string, unknown>>();

      return updated ? toReadResult(updated) : null;
    },

    async markAllAsRead(
      studentNumber: string
    ): Promise<NotificationReadAllResult> {
      const readAt = new Date().toISOString();
      const count = await countUnreadByStudentNumber(studentNumber);

      if (count === 0) {
        return {
          updated_count: 0,
          read_at: readAt,
        };
      }

      await db
        .prepare(
          `
          UPDATE notifications
          SET read_at = ?,
              updated_at = CURRENT_TIMESTAMP
          WHERE user_id IN (
            SELECT id
            FROM users
            WHERE student_number = ?
              AND is_active = 1
          )
            AND read_at IS NULL
          `
        )
        .bind(readAt, studentNumber)
        .run();

      return {
        updated_count: count,
        read_at: readAt,
      };
    },
  };
}
