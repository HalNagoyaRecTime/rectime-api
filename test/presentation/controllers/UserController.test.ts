import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IUserService } from '../../../src/application/services/IUserService';
import type { Env } from '../../../src/lib/env';
import { createUserController } from '../../../src/presentation/controllers/UserController';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

const userStatus = { user_id: 10, is_live_active: false };

function setup(overrides: Partial<IUserService> = {}) {
  const service: IUserService = {
    updateUserStatus: vi.fn().mockResolvedValue(userStatus),
    ...overrides,
  };
  const controller = createUserController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set(
      'authenticatedUserId',
      c.req.header('Cookie')?.includes('session=session-id') ? 1 : null
    );
    await next();
  });
  app.patch('/admin/users/:userId', c => controller.updateUserStatus(c));

  const request = async (
    path: string,
    body: unknown,
    authenticated = true
  ): Promise<Response> =>
    await app.request(
      path,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(authenticated ? { Cookie: 'session=session-id' } : {}),
        },
        body: JSON.stringify(body),
      },
      {} as Env
    );

  return { service, request };
}

describe('UserController', () => {
  describe('updateUserStatus', () => {
    it('Userを無効化して変更後の状態を返す', async () => {
      const { service, request } = setup();

      const response = await request('/admin/users/10', {
        is_live_active: false,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(userStatus);
      expect(service.updateUserStatus).toHaveBeenCalledWith({
        operator_user_id: 1,
        user_id: 10,
        is_live_active: false,
      });
    });

    it('Userを再有効化できる', async () => {
      const { service, request } = setup({
        updateUserStatus: vi
          .fn()
          .mockResolvedValue({ user_id: 10, is_live_active: true }),
      });

      const response = await request('/admin/users/10', {
        is_live_active: true,
      });

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        user_id: 10,
        is_live_active: true,
      });
      expect(service.updateUserStatus).toHaveBeenCalledWith({
        operator_user_id: 1,
        user_id: 10,
        is_live_active: true,
      });
    });

    it('未認証の場合は401を返す', async () => {
      const { service, request } = setup();

      const response = await request(
        '/admin/users/10',
        { is_live_active: false },
        false
      );

      expect(response.status).toBe(401);
      expect(service.updateUserStatus).not.toHaveBeenCalled();
    });

    // 以下2つはコントローラ内の保険を対象にしている。実運用では
    // ルート定義(OpenAPI)の検証が先に走り、ここへは到達しないため、
    // 応答コードがルート側と揃っていることまで確認する。
    it.each(['0', '-1', 'abc'])('userIdが%sの場合は400を返す', async userId => {
      const { service, request } = setup();

      const response = await request(`/admin/users/${userId}`, {
        is_live_active: false,
      });

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(service.updateUserStatus).not.toHaveBeenCalled();
    });

    it.each([
      ['is_live_activeがboolean以外', { is_live_active: 'false' }],
      ['is_live_activeがない', {}],
      ['未知のキーを含む', { is_live_active: false, user_name: '変更' }],
    ])('リクエストボディが%sの場合は400を返す', async (_label, body) => {
      const { service, request } = setup();

      const response = await request('/admin/users/10', body);

      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: 'VALIDATION_ERROR' },
      });
      expect(service.updateUserStatus).not.toHaveBeenCalled();
    });

    it('対象Userが存在しない場合は404を返す', async () => {
      const { request } = setup({
        updateUserStatus: vi
          .fn()
          .mockRejectedValue(new Error('User not found')),
      });

      const response = await request('/admin/users/999', {
        is_live_active: false,
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        error: {
          code: 'USER_NOT_FOUND',
          message: 'ユーザーが見つかりません',
        },
      });
    });

    it('予期しないエラーの場合は500を返し、内部エラーの詳細を応答に含めない', async () => {
      const { request } = setup({
        updateUserStatus: vi
          .fn()
          .mockRejectedValue(new Error('D1 unavailable: table users')),
      });

      const response = await request('/admin/users/10', {
        is_live_active: false,
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        error: {
          code: 'USER_STATUS_UPDATE_FAILED',
          message: 'ユーザー状態の更新に失敗しました',
        },
      });
    });

    it.each([
      [
        '自分自身',
        'Cannot deactivate yourself',
        {
          code: 'CANNOT_DEACTIVATE_SELF',
          message: '自分自身を無効化することはできません',
        },
      ],
      [
        '最後の管理権限保持者',
        'Cannot deactivate the last active staff',
        {
          code: 'CANNOT_DEACTIVATE_LAST_STAFF',
          message: '有効な管理権限保持者が0人になるため無効化できません',
        },
      ],
    ])(
      '%sの無効化をサービスが断った場合は400を返す',
      async (_label, thrownMessage, expectedError) => {
        const { request } = setup({
          updateUserStatus: vi.fn().mockRejectedValue(new Error(thrownMessage)),
        });

        const response = await request('/admin/users/10', {
          is_live_active: false,
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: expectedError });
      }
    );
  });
});
