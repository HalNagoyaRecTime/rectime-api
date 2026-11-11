import type { D1Database } from '@cloudflare/workers-types';
import { and, eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import type { IGatheringSettingsTransaction } from '../../domain/interfaces/transactions/IGatheringSettingsTransaction';
import * as schema from '../database/schema';
import { events } from '../database/schema';
import { buildEventGatheringStatements } from '../repositories/EventGatheringStatements';
import { buildGatheringNotificationStatements } from '../repositories/GatheringNotificationStatements';

// SQLiteにはbatchの途中でエラーを起こす構文が無いため、整数のオーバーフローで
// 失敗する式を使う。batchは1つのトランザクションなので、エラーになると、
// この文より後の文は1つも実行されない。
const OVERFLOW_ERROR_MESSAGE = 'integer overflow';

// 版が一致するときは何もせず、一致しないとき(Eventが無いときも含む)はエラーにする。
// batchの先頭に置くことで、後続の全ての文が「版が一致するとき」だけ実行される。
// 文ごとに版の条件を付けると、あとから文が足されたときに付け忘れて、版が違うのに
// 一部だけ書き込まれるおそれがある。この文はbatchの内容に依らず全体を守る。
function selectLockVersionGuard(
  orm: ReturnType<typeof drizzle>,
  eventId: number,
  expectedLockVersion: number
) {
  return orm
    .select({
      guard: sql<null>`CASE
        WHEN EXISTS (
          SELECT 1 FROM events
          WHERE event_id = ${eventId} AND lock_version = ${expectedLockVersion}
        ) THEN NULL
        ELSE abs(-9223372036854775807 - 1)
      END`,
    })
    .from(sql`(SELECT 1)`);
}

function isLockVersionGuardError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  while (current instanceof Error && !visited.has(current)) {
    visited.add(current);
    if (current.message.includes(OVERFLOW_ERROR_MESSAGE)) return true;
    current = current.cause;
  }
  return false;
}

export function createGatheringSettingsTransaction(
  db: D1Database
): IGatheringSettingsTransaction {
  const orm = drizzle(db, { schema });
  return {
    async apply(changeSet, notifications = {}, options = {}) {
      // 通知を先に処理し、集合予定の変更と同じbatchで確定する。
      const statements = [
        ...buildGatheringNotificationStatements(
          orm,
          changeSet.event_id,
          notifications
        ),
        ...buildEventGatheringStatements(orm, changeSet),
      ];
      // 変更が無い保存は何も書かず、eventsの版も進めない。
      if (statements.length === 0) return true;

      const expected = options.expectedLockVersion;
      // 集合設定の保存でもeventsの版を進める。PUT /events/{id} と版を共有するため、
      // 保存後に古い版で送られた一方は409になる。必ず最後に置く。
      const bumpLockVersion = orm
        .update(events)
        .set({
          updatedAt: sql`CURRENT_TIMESTAMP`,
          lockVersion: sql`${events.lockVersion} + 1`,
        })
        .where(
          and(
            eq(events.id, changeSet.event_id),
            expected === undefined
              ? undefined
              : eq(events.lockVersion, expected)
          )
        )
        .returning({ id: events.id });

      const [first, ...rest] = [
        ...(expected === undefined
          ? []
          : [selectLockVersionGuard(orm, changeSet.event_id, expected)]),
        ...statements,
        bumpLockVersion,
      ];
      try {
        const results = await orm.batch([first, ...rest]);
        // 最後のeventsの更新が0件なら、Eventが無い。
        const bumped = results[results.length - 1] as { id: number }[];
        return bumped.length > 0;
      } catch (error) {
        if (expected !== undefined && isLockVersionGuardError(error)) {
          return false;
        }
        throw error;
      }
    },
  };
}
