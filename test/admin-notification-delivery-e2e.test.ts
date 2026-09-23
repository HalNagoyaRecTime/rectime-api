import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MessageBatch } from '@cloudflare/workers-types';
import type { IFcmService } from '../src/application/services/IFcmService';
import { createNotificationAudienceResolverService } from '../src/application/services/NotificationAudienceResolverService';
import { createNotificationDeliveryService } from '../src/application/services/NotificationDeliveryService';
import type { INotificationDeliveryService } from '../src/application/services/INotificationDeliveryService';
import type { IScheduledNotificationService } from '../src/application/services/IScheduledNotificationService';
import type { NotificationDeliveryMessage } from '../src/domain/entities/NotificationDelivery';
import { signAccessToken } from '../src/infrastructure/auth/jwt';
import { createNotificationAudienceResolverRepository } from '../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationDeliveryRepository } from '../src/infrastructure/repositories/NotificationDeliveryRepository';
import worker, { app } from '../src/index';
import type { Env } from '../src/lib/env';

const JWT_SECRET = 'e'.repeat(32);
const testEnv: Env = { ...workerEnv, JWT_SECRET };

function buildExecutionContext(): {
  ctx: ExecutionContext;
  waitUntilPromises: Promise<unknown>[];
} {
  const waitUntilPromises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => waitUntilPromises.push(promise),
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  return { ctx, waitUntilPromises };
}

async function insertUser(name: string): Promise<number> {
  const row = await workerEnv.DB.prepare(
    'INSERT INTO users (user_name, is_live_active) VALUES (?, 1) RETURNING user_id'
  )
    .bind(name)
    .first<{ user_id: number }>();
  if (!row) throw new Error('E2E用Userを作成できませんでした');
  return row.user_id;
}

async function createStaffToken(): Promise<string> {
  const userId = await insertUser('Delivery E2E staff');
  await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
    .bind(userId)
    .run();
  return signAccessToken(
    {
      sub: String(userId),
      oid: `notification-delivery-e2e-${userId}`,
      email: 'notification-delivery-e2e@example.com',
      display_name: 'Notification Delivery E2E staff',
      client_type: 'web',
    },
    JWT_SECRET,
    3600
  );
}

describe('Admin notification POST to FCM', () => {
  beforeEach(async () => {
    await workerEnv.DB.batch([
      workerEnv.DB.prepare('DELETE FROM notification_push_deliveries'),
      workerEnv.DB.prepare('DELETE FROM notification_recipients'),
      workerEnv.DB.prepare('DELETE FROM notification_audiences'),
      workerEnv.DB.prepare('DELETE FROM notification_schedules'),
      workerEnv.DB.prepare('DELETE FROM notifications'),
      workerEnv.DB.prepare('DELETE FROM firebase_tokens'),
      workerEnv.DB.prepare('DELETE FROM gathering_group_members'),
      workerEnv.DB.prepare('DELETE FROM gatherings'),
      workerEnv.DB.prepare('DELETE FROM gathering_spots'),
      workerEnv.DB.prepare('DELETE FROM students'),
      workerEnv.DB.prepare('DELETE FROM staffs'),
      workerEnv.DB.prepare('DELETE FROM teachers'),
      workerEnv.DB.prepare('DELETE FROM events'),
      workerEnv.DB.prepare('DELETE FROM users'),
    ]);
  });

  it('Admin POSTからCron / Queue entrypointを通りDelivery完了まで処理する', async () => {
    const token = await createStaffToken();
    const recipientUserId = await insertUser('Delivery E2E recipient');
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 1, 'delivery-e2e-ios-token')`
      ).bind(recipientUserId),
      workerEnv.DB.prepare(
        `INSERT INTO firebase_tokens (user_id, platform, fcm_token)
         VALUES (?, 2, 'delivery-e2e-android-token')`
      ).bind(recipientUserId),
    ]);

    const response = await app.fetch(
      new Request('http://example.com/api/v1/admin/notifications', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Client-Type': 'web',
        },
        body: JSON.stringify({
          content: {
            push: { title: 'E2E push title', body: 'E2E push body' },
            detail: { title: 'E2E detail title', body: 'E2E detail body' },
          },
          audience: { items: [{ type: 'user', targetId: recipientUserId }] },
          delivery: { type: 'immediate', sendAt: null },
          importance: 'normal',
        }),
      }),
      testEnv
    );
    expect(response.status).toBe(201);
    const created = (await response.json()) as {
      notificationId: number;
      notificationScheduleId: number;
    };

    const resolver = createNotificationAudienceResolverService(
      createNotificationAudienceResolverRepository(workerEnv.DB)
    );
    const messages: NotificationDeliveryMessage[] = [];
    const fcmService: IFcmService = {
      sendTestNotification: vi.fn(),
      sendNotificationToToken: vi.fn(async input => ({
        success: true as const,
        messageId: `projects/e2e/messages/${input.token}`,
      })),
    };
    const deliveryService = createNotificationDeliveryService({
      notificationDeliveryRepository: createNotificationDeliveryRepository(
        workerEnv.DB
      ),
      notificationDeliveryQueue: {
        enqueueMany: vi.fn(async batch => {
          messages.push(...batch);
        }),
      },
      fcmService,
    });
    const resolveDueSchedules = vi.fn((now: Date) =>
      resolver.resolveDueSchedules(now)
    );
    const enqueueReadySchedules = vi.fn((now?: Date) =>
      deliveryService.enqueueReadySchedules(now)
    );
    const sendQueuedNotifications = vi.fn((ids: number[], now?: Date) =>
      deliveryService.sendQueuedNotifications(ids, now)
    );
    const runtimeDeliveryService: INotificationDeliveryService = {
      enqueueReadySchedules,
      sendQueuedNotifications,
    };
    const legacyService: IScheduledNotificationService = {
      enqueueDueNotifications: vi.fn(),
      sendQueuedNotifications: vi.fn().mockResolvedValue({
        checkedEvents: 0,
        sent: 0,
        failed: 0,
      }),
    };
    const containerModule = await import('../src/di/container');
    const createDIContainerSpy = vi
      .spyOn(containerModule, 'createDIContainer')
      .mockReturnValue({
        notificationAudienceResolverService: { resolveDueSchedules },
        notificationDeliveryService: runtimeDeliveryService,
        scheduledNotificationService: legacyService,
      } as unknown as ReturnType<typeof containerModule.createDIContainer>);

    try {
      const scheduledTime = Date.now() + 60_000;
      const scheduleTime = new Date(scheduledTime);
      const { ctx, waitUntilPromises } = buildExecutionContext();
      const scheduledEvent = {
        cron: '* * * * *',
        scheduledTime,
        noRetry: () => {},
      } as unknown as ScheduledEvent;

      await worker.scheduled(
        scheduledEvent,
        { ...testEnv, EVENT_DATE: '' },
        ctx
      );
      await Promise.all(waitUntilPromises);

      expect(resolveDueSchedules).toHaveBeenCalledWith(scheduleTime);
      expect(enqueueReadySchedules).toHaveBeenCalledWith(scheduleTime);
      expect(messages).toEqual([
        { notificationScheduleIds: [created.notificationScheduleId] },
      ]);

      const queueMessage = {
        id: 'notification-delivery-e2e',
        timestamp: new Date(),
        body: messages[0],
        attempts: 1,
        ack: vi.fn(),
        retry: vi.fn(),
      };
      await worker.queue(
        {
          messages: [queueMessage],
          queue: 'rectime-notification-delivery-dev',
        } as unknown as MessageBatch<NotificationDeliveryMessage>,
        testEnv
      );

      expect(sendQueuedNotifications).toHaveBeenCalledWith([
        created.notificationScheduleId,
      ]);
      await worker.queue(
        {
          messages: [queueMessage],
          queue: 'rectime-notification-delivery-dev',
        } as unknown as MessageBatch<NotificationDeliveryMessage>,
        testEnv
      );
      expect(fcmService.sendNotificationToToken).toHaveBeenCalledTimes(2);
      expect(queueMessage.ack).toHaveBeenCalledTimes(2);
      expect(queueMessage.retry).not.toHaveBeenCalled();
      expect(legacyService.sendQueuedNotifications).toHaveBeenCalledWith([
        created.notificationScheduleId,
      ]);
      expect(fcmService.sendNotificationToToken).toHaveBeenCalledTimes(2);
      expect(fcmService.sendNotificationToToken).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'E2E push title',
          body: 'E2E push body',
          importance: 2,
          data: {
            type: 'manual',
            notificationId: String(created.notificationId),
          },
        })
      );

      const saved = await workerEnv.DB.prepare(
        `SELECT s.send_status, s.completed_at, COUNT(d.notification_push_delivery_id) AS delivery_count,
                SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
                MIN(d.attempt_count) AS min_attempt_count
         FROM notification_schedules s
         JOIN notification_push_deliveries d
           ON d.notification_recipient_id IN (
             SELECT notification_recipient_id FROM notification_recipients
             WHERE notification_schedule_id = s.notification_schedule_id
           )
         WHERE s.notification_schedule_id = ?
         GROUP BY s.notification_schedule_id`
      )
        .bind(created.notificationScheduleId)
        .first<Record<string, unknown>>();
      expect(saved).toMatchObject({
        send_status: 'completed',
        delivery_count: 2,
        sent_count: 2,
        min_attempt_count: 1,
      });
      expect(saved?.completed_at).not.toBeNull();
    } finally {
      createDIContainerSpy.mockRestore();
    }
  });
});
