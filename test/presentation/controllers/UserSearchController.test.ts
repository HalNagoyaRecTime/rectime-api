import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IUserSearchService } from '../../../src/application/services/IUserSearchService';
import type { Env } from '../../../src/lib/env';
import { createUserSearchController } from '../../../src/presentation/controllers/UserSearchController';
import type { AuthenticationVariables } from '../../../src/presentation/middleware/bearerAuthentication';
import type { ContainerVariables } from '../../../src/presentation/middleware/diContainer';
import type { AuthVariables } from '../../../src/presentation/middleware/requireAuth';

const result = {
  items: [
    {
      user_id: 1,
      display_name: '田中太郎',
      is_live_active: true,
      categories: ['student' as const],
    },
  ],
  total: 1,
};

function setup() {
  const service: IUserSearchService = {
    searchUsers: vi.fn().mockImplementation(query =>
      Promise.resolve({
        ...result,
        limit: query.limit,
        offset: query.offset,
      })
    ),
  };
  const controller = createUserSearchController(service);
  const app = new Hono<{
    Bindings: Env;
    Variables: ContainerVariables & AuthVariables & AuthenticationVariables;
  }>();
  app.use('*', async (c, next) => {
    c.set(
      'authenticatedUserId',
      c.req.header('Cookie')?.includes('session=session-id') ? 10 : null
    );
    await next();
  });
  app.get('/admin/users', c => controller.searchUsers(c));
  const request = async (
    path: string,
    authenticated = true
  ): Promise<Response> =>
    await app.request(
      path,
      {
        headers: authenticated ? { Cookie: 'session=session-id' } : {},
      },
      {} as Env
    );
  return { service, request };
}

describe('UserSearchController', () => {
  it('検索結果とデフォルトのページングを返す', async () => {
    const { service, request } = setup();

    const response = await request(
      '/admin/users?q=%E7%94%B0%E4%B8%AD&category=student&status=inactive&limit=20&offset=10'
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      items: result.items,
      total: 1,
      limit: 20,
      offset: 10,
    });
    expect(service.searchUsers).toHaveBeenCalledWith({
      q: '田中',
      category: 'student',
      status: 'inactive',
      limit: 20,
      offset: 10,
    });
  });

  it('クエリ省略時はall・active・50件・offset 0を使う', async () => {
    const { service, request } = setup();

    const response = await request('/admin/users');

    expect(response.status).toBe(200);
    expect(service.searchUsers).toHaveBeenCalledWith({
      category: 'all',
      status: 'active',
      limit: 50,
      offset: 0,
    });
  });

  it.each([
    '/admin/users?category=staff',
    '/admin/users?status=unknown',
    '/admin/users?limit=101',
    '/admin/users?offset=-1',
    '/admin/users?q=',
  ])('不正なクエリ%sは400を返す', async path => {
    const { service, request } = setup();

    const response = await request(path);

    expect(response.status).toBe(400);
    expect(service.searchUsers).not.toHaveBeenCalled();
  });

  it('未認証なら401を返す', async () => {
    const { service, request } = setup();

    const response = await request('/admin/users', false);

    expect(response.status).toBe(401);
    expect(service.searchUsers).not.toHaveBeenCalled();
  });

  it('Repositoryエラーは500を返す', async () => {
    const { service, request } = setup();
    (service.searchUsers as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('database failed')
    );

    const response = await request('/admin/users');

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to search users',
      details: 'database failed',
    });
  });
});
