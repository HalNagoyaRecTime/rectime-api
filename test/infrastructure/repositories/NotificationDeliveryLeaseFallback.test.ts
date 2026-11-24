import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';
import {
  NOW,
  clearNotificationFixtures,
  createDeliveryFixture,
  getDelivery,
} from '../../notificationDeliveryFixtures';

const LEASE_TIMEOUT_MS = 120_000;

describe('Push Deliveryのlease更新フォールバック', () => {
  beforeEach(clearNotificationFixtures);

  it('まとめたlease更新が失敗したら1件ずつ再実行してleaseを取得する', async () => {
    const { delivery } = await createDeliveryFixture();
    const repository = createNotificationDeliveryRepository(
      createBatchFailingDb({ individualFailure: 'none' })
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      expect(
        await renewLeases(repository, [delivery.notification_push_delivery_id])
      ).toEqual([delivery.notification_push_delivery_id]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('1件ずつ再実行します'),
        expect.objectContaining({ error: expect.any(Error) })
      );
    } finally {
      warn.mockRestore();
    }
  });

  it('個別実行でも失敗したDeliveryだけをlease取得済みの戻り値から外す', async () => {
    const { delivery } = await createDeliveryFixture();
    const repository = createNotificationDeliveryRepository(
      createBatchFailingDb({ individualFailure: 'all' })
    );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      expect(
        await renewLeases(repository, [delivery.notification_push_delivery_id])
      ).toEqual([]);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining('個別再実行に失敗しました'),
        expect.objectContaining({
          deliveryId: delivery.notification_push_delivery_id,
        })
      );
      // 送信されないまま残り、後続のタイムアウト回収に委ねられる。
      expect(
        await getDelivery(delivery.notification_push_delivery_id)
      ).toMatchObject({ status: 'sending' });
    } finally {
      warn.mockRestore();
    }
  });
});

function renewLeases(
  repository: ReturnType<typeof createNotificationDeliveryRepository>,
  deliveryIds: number[]
) {
  return repository.renewDeliveryLeases(
    deliveryIds.map(deliveryId => ({ deliveryId, attemptCount: 1 })),
    NOW.toISOString(),
    new Date(NOW.getTime() - LEASE_TIMEOUT_MS).toISOString()
  );
}

// 最初のdb.batch()だけを失敗させ、1件ずつ再実行する経路を検証する。
// individualFailure: 'none' は個別実行を成功させ、'all' は個別実行も失敗させる。
function createBatchFailingDb(options: {
  individualFailure: 'none' | 'all';
}): D1Database {
  let batchFailed = false;
  const wrap = (statement: D1PreparedStatement) => ({
    statement,
    bind: (...values: unknown[]) => wrap(statement.bind(...values)),
    async run() {
      if (batchFailed && options.individualFailure === 'all') {
        throw new Error('個別のlease更新に失敗しました');
      }
      return statement.run();
    },
  });
  return {
    prepare: (query: string) => wrap(env.DB.prepare(query)),
    async batch(statements: { statement: D1PreparedStatement }[]) {
      if (!batchFailed) {
        batchFailed = true;
        throw new Error('まとめたlease更新に失敗しました');
      }
      return env.DB.batch(statements.map(({ statement }) => statement));
    },
  } as unknown as D1Database;
}
