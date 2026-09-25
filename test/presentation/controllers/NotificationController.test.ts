import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createNotificationController } from '../../../src/presentation/controllers/NotificationController';
import type { IFcmService } from '../../../src/application/services/IFcmService';

function setup() {
  const fcmService: IFcmService = {
    sendTestNotification: vi.fn(),
    sendNotificationToToken: vi.fn(),
  };
  const controller = createNotificationController(fcmService);
  const app = new Hono();
  app.post('/notifications/test', c => controller.sendTestNotification(c));
  return { app, fcmService };
}

describe('NotificationController', () => {
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
        error: { code: string; message: string; details: unknown };
      };
      expect(responseBody.error.message).toBe(
        '通知の入力内容が正しくありません'
      );
      expect(responseBody.error.details).toEqual({
        fieldErrors: {
          title: ['String must contain at least 1 character(s)'],
        },
        formErrors: [],
      });
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

    it('不正なJSONでは400を返す', async () => {
      const { app, fcmService } = setup();

      const res = await app.request('/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{',
      });

      expect(res.status).toBe(400);
      const responseBody = (await res.json()) as {
        error: { message: string };
      };
      expect(responseBody.error.message).toBe(
        '通知の入力内容が正しくありません'
      );
      expect(fcmService.sendTestNotification).not.toHaveBeenCalled();
    });

    it('サービスが例外を投げた場合は内部詳細を含めず500を返す', async () => {
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
        error: {
          code: 'TEST_NOTIFICATION_SEND_FAILED',
          message: 'テスト通知の送信に失敗しました',
        },
      });
    });
  });
});
