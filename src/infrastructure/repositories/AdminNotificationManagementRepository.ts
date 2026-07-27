import type {
  D1Database,
  D1PreparedStatement,
} from '@cloudflare/workers-types';
import type {
  AdminNotificationListOptions,
  AdminNotificationSummary,
  UpdateAdminNotificationInput,
} from '../../domain/entities/AdminNotificationManagement';
import type { IAdminNotificationManagementRepository } from '../../domain/interfaces/repositories/IAdminNotificationManagementRepository';
import { buildAudienceTokenSelect } from './AdminNotificationAudienceQuery';

interface AdminNotificationRow {
  notification_id: number;
  notification_type: string;
  title: string;
  body: string;
  scheduled_at: string;
  related_event_id: number | null;
  related_event_name: string | null;
  created_user_id: number | null;
  creator_name: string | null;
  recipient_count: number;
  draft_count: number;
  sending_count: number;
  sent_count: number;
  failed_count: number;
  created_at: string;
  updated_at: string;
}

const aggregationSelection = `
  n.notification_id,
  n.notification_type,
  n.title,
  n.body,
  MIN(ns.send_at) AS scheduled_at,
  CASE
    WHEN COUNT(DISTINCT ns.event_id) = 1 THEN MAX(ns.event_id)
    ELSE NULL
  END AS related_event_id,
  CASE
    WHEN COUNT(DISTINCT ns.event_id) = 1 THEN MAX(e.event_name)
    ELSE NULL
  END AS related_event_name,
  MIN(ns.created_user_id) AS created_user_id,
  MIN(creator.user_name) AS creator_name,
  COUNT(*) AS recipient_count,
  SUM(CASE WHEN ns.send_status = 'draft' THEN 1 ELSE 0 END) AS draft_count,
  SUM(CASE WHEN ns.send_status = 'sending' THEN 1 ELSE 0 END) AS sending_count,
  SUM(CASE WHEN ns.send_status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
  SUM(CASE WHEN ns.send_status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
  n.created_at,
  MAX(
    CASE
      WHEN n.updated_at >= ns.updated_at THEN n.updated_at
      ELSE ns.updated_at
    END
  ) AS updated_at`;

export function createAdminNotificationManagementRepository(
  db: D1Database
): IAdminNotificationManagementRepository {
  const findById = async (
    notificationId: number
  ): Promise<AdminNotificationSummary | null> => {
    const row = await db
      .prepare(
        `SELECT ${aggregationSelection}
         FROM notifications n
         INNER JOIN notification_schedules ns
           ON ns.notification_id = n.notification_id
         LEFT JOIN events e ON e.event_id = ns.event_id
         LEFT JOIN users creator ON creator.user_id = ns.created_user_id
         WHERE n.notification_id = ?
         GROUP BY n.notification_id`
      )
      .bind(notificationId)
      .first<AdminNotificationRow>();
    return row ? toSummary(row) : null;
  };

  return {
    async findAll(options) {
      const filter = buildListFilter(options);
      const [rowsResult, countResult] = await db.batch([
        db
          .prepare(
            `SELECT ${aggregationSelection}
             FROM notifications n
             INNER JOIN notification_schedules ns
               ON ns.notification_id = n.notification_id
             LEFT JOIN events e ON e.event_id = ns.event_id
             LEFT JOIN users creator ON creator.user_id = ns.created_user_id
             ${filter.where}
             GROUP BY n.notification_id
             ORDER BY datetime(MIN(ns.send_at)) ASC, n.notification_id ASC
             LIMIT ? OFFSET ?`
          )
          .bind(...filter.bindings, options.limit, options.offset),
        db
          .prepare(
            `SELECT COUNT(*) AS total
             FROM notifications n
             WHERE EXISTS (
               SELECT 1
               FROM notification_schedules ns
               WHERE ns.notification_id = n.notification_id
             )
             ${filter.andConditions}`
          )
          .bind(...filter.bindings),
      ]);

      const rows = rowsResult.results as unknown as AdminNotificationRow[];
      const totalRow = countResult.results[0] as { total: number } | undefined;
      return {
        notifications: rows.map(toSummary),
        total: totalRow?.total ?? 0,
      };
    },

    findById,

    async update(input) {
      const statements = input.audience
        ? buildAudienceUpdateStatements(db, input)
        : buildContentUpdateStatements(db, input);
      const results = await db.batch(statements);
      if ((results[0]?.meta.changes ?? 0) > 0) return 'updated';

      const current = await findById(input.notification_id);
      if (!current) return 'not_found';
      if (current.delivery_summary.draft !== current.delivery_summary.total) {
        return 'not_draft';
      }
      return 'no_active_tokens';
    },

    async deleteDraft(notificationId) {
      const results = await db.batch([
        db
          .prepare(
            `DELETE FROM notification_schedules
             WHERE notification_id = ?
               AND send_status = 'draft'
               AND NOT EXISTS (
                 SELECT 1
                 FROM notification_schedules guarded
                 WHERE guarded.notification_id = ?
                   AND guarded.send_status <> 'draft'
               )`
          )
          .bind(notificationId, notificationId),
        db
          .prepare(
            `DELETE FROM notifications
             WHERE notification_id = ?
               AND NOT EXISTS (
                 SELECT 1
                 FROM notification_schedules
                 WHERE notification_schedules.notification_id =
                   notifications.notification_id
               )`
          )
          .bind(notificationId),
      ]);
      if ((results[1]?.meta.changes ?? 0) > 0) return 'deleted';

      const current = await findById(notificationId);
      return current ? 'not_draft' : 'not_found';
    },
  };
}

function toSummary(row: AdminNotificationRow): AdminNotificationSummary {
  return {
    notification_id: row.notification_id,
    notification_type: row.notification_type,
    title: row.title,
    body: row.body,
    scheduled_at: row.scheduled_at,
    related_event_id: row.related_event_id,
    related_event_name: row.related_event_name,
    created_user_id: row.created_user_id,
    creator_name: row.creator_name,
    recipient_count: row.recipient_count,
    audience:
      row.related_event_id === null
        ? {
            type: 'resolved_recipients',
            recipient_count: row.recipient_count,
          }
        : {
            type: 'event_participants',
            event_id: row.related_event_id,
            recipient_count: row.recipient_count,
          },
    delivery_summary: {
      total: row.recipient_count,
      draft: row.draft_count,
      sending: row.sending_count,
      sent: row.sent_count,
      failed: row.failed_count,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function buildListFilter(options: AdminNotificationListOptions): {
  where: string;
  andConditions: string;
  bindings: Array<string | number>;
} {
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];
  if (options.send_status) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM notification_schedules filtered_status
         WHERE filtered_status.notification_id = n.notification_id
           AND filtered_status.send_status = ?
       )`
    );
    bindings.push(options.send_status);
  }
  if (options.event_id !== undefined) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM notification_schedules filtered_event
         WHERE filtered_event.notification_id = n.notification_id
           AND filtered_event.event_id = ?
       )`
    );
    bindings.push(options.event_id);
  }
  if (options.from) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM notification_schedules filtered_from
         WHERE filtered_from.notification_id = n.notification_id
           AND datetime(filtered_from.send_at) >= datetime(?)
       )`
    );
    bindings.push(options.from);
  }
  if (options.to) {
    conditions.push(
      `EXISTS (
         SELECT 1 FROM notification_schedules filtered_to
         WHERE filtered_to.notification_id = n.notification_id
           AND datetime(filtered_to.send_at) <= datetime(?)
       )`
    );
    bindings.push(options.to);
  }

  const joined = conditions.join(' AND ');
  return {
    where: joined ? `WHERE ${joined}` : '',
    andConditions: joined ? `AND ${joined}` : '',
    bindings,
  };
}

function buildContentUpdateStatements(
  db: D1Database,
  input: UpdateAdminNotificationInput
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    buildGuardedNotificationUpdate(db, input),
  ];
  if (input.scheduled_at) {
    statements.push(
      db
        .prepare(
          `UPDATE notification_schedules
           SET send_at = ?, updated_at = CURRENT_TIMESTAMP
           WHERE notification_id = ?
             AND send_status = 'draft'
             AND NOT EXISTS (
               SELECT 1
               FROM notification_schedules guarded
               WHERE guarded.notification_id = ?
                 AND guarded.send_status <> 'draft'
             )`
        )
        .bind(input.scheduled_at, input.notification_id, input.notification_id)
    );
  }
  return statements;
}

function buildAudienceUpdateStatements(
  db: D1Database,
  input: UpdateAdminNotificationInput
): D1PreparedStatement[] {
  const audience = input.audience!;
  const tokenSelect = buildAudienceTokenSelect(audience);
  const eventId =
    audience.type === 'event_participants' ? audience.event_id : null;

  return [
    buildGuardedNotificationUpdate(db, input, tokenSelect),
    db
      .prepare(
        `DELETE FROM notification_schedules
         WHERE notification_id = ?
           AND send_status = 'draft'
           AND NOT EXISTS (
             SELECT 1
             FROM notification_schedules guarded
             WHERE guarded.notification_id = ?
               AND guarded.send_status <> 'draft'
           )
           AND EXISTS (
             SELECT 1 FROM (${tokenSelect.sql})
           )`
      )
      .bind(
        input.notification_id,
        input.notification_id,
        ...tokenSelect.bindings
      ),
    db
      .prepare(
        `WITH replacement_allowed AS MATERIALIZED (
           SELECT changes() AS deleted_count
         )
         INSERT INTO notification_schedules (
           created_user_id,
           event_id,
           notification_id,
           firebase_token_id,
           importance,
           send_status,
           send_at
         )
         SELECT
           ?,
           ?,
           ?,
           audience.firebase_token_id,
           2,
           'draft',
           ?
         FROM replacement_allowed
         CROSS JOIN (${tokenSelect.sql}) audience
         WHERE replacement_allowed.deleted_count > 0`
      )
      .bind(
        input.created_user_id,
        eventId,
        input.notification_id,
        input.scheduled_at!,
        ...tokenSelect.bindings
      ),
  ];
}

function buildGuardedNotificationUpdate(
  db: D1Database,
  input: UpdateAdminNotificationInput,
  tokenSelect?: { sql: string; bindings: number[] }
): D1PreparedStatement {
  const targetGuard = tokenSelect
    ? `AND EXISTS (SELECT 1 FROM (${tokenSelect.sql}))`
    : '';
  return db
    .prepare(
      `UPDATE notifications
       SET title = COALESCE(?, title),
           body = COALESCE(?, body),
           updated_at = CURRENT_TIMESTAMP
       WHERE notification_id = ?
         AND EXISTS (
           SELECT 1
           FROM notification_schedules
           WHERE notification_schedules.notification_id =
             notifications.notification_id
         )
         AND NOT EXISTS (
           SELECT 1
           FROM notification_schedules guarded
           WHERE guarded.notification_id = notifications.notification_id
             AND guarded.send_status <> 'draft'
         )
         ${targetGuard}`
    )
    .bind(
      input.title ?? null,
      input.body ?? null,
      input.notification_id,
      ...(tokenSelect?.bindings ?? [])
    );
}
