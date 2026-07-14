import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../../../src/index';

describe('POST /api/v1/admin/notifications', () => {
  it('全体向けの手動通知を作成できる', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: '全体連絡',
          body: '体育館前に集合してください。',
          targetType: 'all',
          targetIds: ['ignored'],
        }),
      }),
      env
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({
      targetType: 'all',
      targetIds: [],
      priority: 2,
      tokens: 0,
      sent: 0,
      failed: 0,
    });
  });

  it('group指定でtargetIdsが空の場合は400を返す', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'グループ連絡',
          body: '集合してください。',
          targetType: 'group',
          targetIds: [],
        }),
      }),
      env
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({
      error: 'Invalid manual notification request body',
    });
  });
});

describe('POST /api/v1/notifications/schedule/run', () => {
  it('nowが不正な日時の場合は400を返す', async () => {
    const res = await app.fetch(
      new Request('http://example.com/api/v1/notifications/schedule/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ now: 'invalid-date' }),
      }),
      env
    );

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid now value' });
  });
});
