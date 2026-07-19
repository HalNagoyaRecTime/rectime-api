import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createNotificationController } from '../../../src/presentation/controllers/NotificationController';
import type { IFcmService } from '../../../src/application/services/IFcmService';
import type { INotificationService } from '../../../src/application/services/INotificationService';

function setup() {
  const fcmService: IFcmService = {
    sendTestNotification: vi.fn(),
    sendNotificationToToken: vi.fn(),
  };
  const notificationService: INotificationService = {
    createNotification: vi.fn(),
    getNotifications: vi.fn(),
    getNotificationById: vi.fn(),
    updateNotification: vi.fn(),
  };
  const controller = createNotificationController(
    fcmService,
    notificationService
  );
  const app = new Hono();
  app.post('/notifications', c => controller.createNotification(c));
  app.get('/notifications', c => controller.getNotifications(c));
  app.get('/notifications/:id', c => controller.getNotificationById(c));
  app.put('/notifications/:id', c => controller.updateNotification(c));
  app.post('/notifications/test', c => controller.sendTestNotification(c));
  return { app, fcmService, notificationService };
}

const notification = {
  notification_id: 1,
  notification_type: 'manual',
  title: '集合場所のお知らせ',
  body: '第1体育館へ集合してください。',
  created_at: '2026-07-18T10:00:00+09:00',
  updated_at: '2026-07-18T10:00:00+09:00',
};

describe('NotificationController', () => {
  it('通知内容を作成して201を返す', async () => {
    const { app, notificationService } = setup();
    (
      notificationService.createNotification as ReturnType<typeof vi.fn>
    ).mockResolvedValue(notification);

    const response = await app.request('/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationType: 'manual',
        title: '集合場所のお知らせ',
        body: '第1体育館へ集合してください。',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual(notification);
    expect(notificationService.createNotification).toHaveBeenCalledWith({
      notification_type: 'manual',
      title: '集合場所のお知らせ',
      body: '第1体育館へ集合してください。',
    });
  });

  it('不正な作成リクエストは400を返す', async () => {
    const { app, notificationService } = setup();
    const response = await app.request('/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notificationType: 'manual',
        title: ' ',
        body: '本文',
      }),
    });

    expect(response.status).toBe(400);
    expect(notificationService.createNotification).not.toHaveBeenCalled();
  });

  it('通知一覧とtotal・limit・offsetを返す', async () => {
    const { app, notificationService } = setup();
    (
      notificationService.getNotifications as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ notifications: [notification], total: 1 });

    const response = await app.request(
      '/notifications?notificationType=manual&limit=20&offset=10'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      notifications: [notification],
      total: 1,
      limit: 20,
      offset: 10,
    });
    expect(notificationService.getNotifications).toHaveBeenCalledWith({
      notification_type: 'manual',
      limit: 20,
      offset: 10,
    });
  });

  it('一覧のlimitとoffsetにデフォルト値を使う', async () => {
    const { app, notificationService } = setup();
    (
      notificationService.getNotifications as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ notifications: [], total: 0 });

    const response = await app.request('/notifications');

    expect(response.status).toBe(200);
    expect(notificationService.getNotifications).toHaveBeenCalledWith({
      notification_type: undefined,
      limit: 50,
      offset: 0,
    });
  });

  it('不正な一覧条件は400を返す', async () => {
    const { app, notificationService } = setup();
    const response = await app.request('/notifications?limit=0');

    expect(response.status).toBe(400);
    expect(notificationService.getNotifications).not.toHaveBeenCalled();
  });

  it('通知詳細を返す', async () => {
    const { app, notificationService } = setup();
    (
      notificationService.getNotificationById as ReturnType<typeof vi.fn>
    ).mockResolvedValue(notification);

    const response = await app.request('/notifications/1');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(notification);
  });

  it('存在しない通知詳細は404を返す', async () => {
    const { app, notificationService } = setup();
    (
      notificationService.getNotificationById as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Notification not found'));

    const response = await app.request('/notifications/999');

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Notification not found' });
  });

  it('通知内容を部分更新する', async () => {
    const { app, notificationService } = setup();
    const updated = { ...notification, title: '集合場所変更のお知らせ' };
    (
      notificationService.updateNotification as ReturnType<typeof vi.fn>
    ).mockResolvedValue(updated);

    const response = await app.request('/notifications/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '集合場所変更のお知らせ' }),
    });

    expect(response.status).toBe(200);
    expect(notificationService.updateNotification).toHaveBeenCalledWith(1, {
      title: '集合場所変更のお知らせ',
    });
    expect(await response.json()).toEqual({
      ...notification,
      title: '集合場所変更のお知らせ',
    });
  });

  it('空の更新内容と不正なIDは400を返す', async () => {
    const { app, notificationService } = setup();
    const empty = await app.request('/notifications/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const invalidId = await app.request('/notifications/not-a-number');

    expect(empty.status).toBe(400);
    expect(invalidId.status).toBe(400);
    expect(notificationService.updateNotification).not.toHaveBeenCalled();
  });

  describe('sendTestNotification', () => {
    it('有効なボディの場合はサービスを呼び出し結果を 200 で返す', async () => {
      const { app, fcmService } = setup();
      const result = { success: true as const, messageId: 'msg-1' };
      (
        fcmService.sendTestNotification as ReturnType<typeof vi.fn>
      ).mockResolvedValue(result);

      const res = await app.request('/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'タイトル', body: '本文' }),
      });

      expect(fcmService.sendTestNotification).toHaveBeenCalledWith({
        title: 'タイトル',
        body: '本文',
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(result);
    });

    it('title が空文字の場合は 400 を返す', async () => {
      const { app, fcmService } = setup();

      const res = await app.request('/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', body: '本文' }),
      });

      expect(res.status).toBe(400);
      const responseBody = (await res.json()) as {
        error: string;
        details: unknown;
      };
      expect(responseBody.error).toBe('Invalid notification request body');
      expect(responseBody.details).toBeDefined();
      expect(fcmService.sendTestNotification).not.toHaveBeenCalled();
    });

    it('body フィールドが無い場合は 400 を返す', async () => {
      const { app } = setup();

      const res = await app.request('/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'タイトル' }),
      });

      expect(res.status).toBe(400);
    });

    it('サービスが例外を投げた場合は 500 と details を返す', async () => {
      const { app, fcmService } = setup();
      (
        fcmService.sendTestNotification as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('fcm error'));

      const res = await app.request('/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'タイトル', body: '本文' }),
      });

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({
        error: 'Failed to send test notification',
        details: 'fcm error',
      });
    });
  });
});
