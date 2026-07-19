import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { createNotificationRepository } from '../../../src/infrastructure/repositories/NotificationRepository';

describe('NotificationRepository', () => {
  const repository = createNotificationRepository(env.DB);
  const notificationIds: number[] = [];

  afterEach(async () => {
    if (notificationIds.length > 0) {
      await env.DB.batch(
        notificationIds.map(id =>
          env.DB.prepare(
            'DELETE FROM notifications WHERE notification_id = ?'
          ).bind(id)
        )
      );
    }
    notificationIds.length = 0;
  });

  async function create(type: string, title: string) {
    const notification = await repository.create({
      notification_type: type,
      title,
      body: `${title}の本文`,
    });
    notificationIds.push(notification.notification_id);
    return notification;
  }

  it('通知内容を作成してIDで取得できる', async () => {
    const created = await create('manual', '集合場所のお知らせ');

    await expect(repository.findById(created.notification_id)).resolves.toEqual(
      created
    );
  });

  it('通知種別・limit・offsetを指定して一覧取得できる', async () => {
    const first = await create('manual', '手動通知1');
    const second = await create('manual', '手動通知2');
    await create('schedule_reminder', '自動通知');

    const result = await repository.findAll({
      notification_type: 'manual',
      limit: 1,
      offset: 1,
    });

    expect(result.total).toBe(2);
    expect(
      result.notifications.map(notification => notification.notification_id)
    ).toEqual([second.notification_id]);
    expect(result.notifications[0].notification_id).not.toBe(
      first.notification_id
    );
  });

  it('通知内容を部分更新できる', async () => {
    const created = await create('manual', '変更前');

    const updated = await repository.update(created.notification_id, {
      title: '変更後',
    });

    expect(updated).toMatchObject({
      notification_id: created.notification_id,
      notification_type: 'manual',
      title: '変更後',
      body: '変更前の本文',
    });
  });

  it('存在しない通知の取得と更新はnullを返す', async () => {
    await expect(repository.findById(999999)).resolves.toBeNull();
    await expect(
      repository.update(999999, { title: '変更後' })
    ).resolves.toBeNull();
  });
});
