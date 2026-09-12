import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IEventGatheringSettingsService } from '../../../src/application/services/IEventGatheringSettingsService';
import { createEventGatheringSettingsController } from '../../../src/presentation/controllers/EventGatheringSettingsController';

const savedSettings = {
  event_id: 12,
  rounds: [
    {
      round: 1,
      gatherings: [
        {
          gathering_id: 101,
          gathering_time: '10:45',
          gathering_spot: {
            gathering_spot_id: 1,
            gathering_spot_name: '出入口①',
          },
          member_count: 16,
        },
      ],
    },
  ],
};

const validBody = {
  rounds: [
    {
      round: 1,
      gatherings: [
        { gathering_id: 101, gathering_time: '10:45', gathering_spot_id: 1 },
        { gathering_time: '10:55', gathering_spot_id: 2 },
      ],
    },
  ],
};

function setup(overrides: Partial<IEventGatheringSettingsService> = {}) {
  const service: IEventGatheringSettingsService = {
    saveEventGatheringSettings: vi.fn().mockResolvedValue(savedSettings),
    ...overrides,
  };
  const controller = createEventGatheringSettingsController(service);
  const app = new Hono();
  app.put('/events/:eventId/gatherings', c =>
    controller.saveEventGatheringSettings(c)
  );

  const request = (path: string, body: unknown) =>
    app.request(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  return { service, request };
}

describe('EventGatheringSettingsController', () => {
  it('集合設定を保存して保存後の一覧を返す', async () => {
    const { service, request } = setup();

    const response = await request('/events/12/gatherings', validBody);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(savedSettings);
    expect(service.saveEventGatheringSettings).toHaveBeenCalledWith({
      event_id: 12,
      rounds: validBody.rounds,
    });
  });

  // 以下の400はコントローラ内の保険を対象にしている。実運用では
  // ルート定義(OpenAPI)の検証が先に走り、ここへは到達しないため、
  // 応答コードがルート側と揃っていることまで確認する。
  it.each(['0', '-1', 'abc'])('eventIdが%sの場合は400を返す', async eventId => {
    const { service, request } = setup();

    const response = await request(`/events/${eventId}/gatherings`, validBody);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.saveEventGatheringSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['roundsがない', {}],
    [
      'roundが0',
      {
        rounds: [
          {
            round: 0,
            gatherings: [{ gathering_time: '10:00', gathering_spot_id: 1 }],
          },
        ],
      },
    ],
    [
      'roundが100',
      {
        rounds: [
          {
            round: 100,
            gatherings: [{ gathering_time: '10:00', gathering_spot_id: 1 }],
          },
        ],
      },
    ],
    ['gatheringsが空', { rounds: [{ round: 1, gatherings: [] }] }],
    [
      '集合時刻が99:59',
      {
        rounds: [
          {
            round: 1,
            gatherings: [{ gathering_time: '99:59', gathering_spot_id: 1 }],
          },
        ],
      },
    ],
    [
      '集合時刻がHHMM',
      {
        rounds: [
          {
            round: 1,
            gatherings: [{ gathering_time: '1000', gathering_spot_id: 1 }],
          },
        ],
      },
    ],
    [
      '集合時刻が24:00',
      {
        rounds: [
          {
            round: 1,
            gatherings: [{ gathering_time: '24:00', gathering_spot_id: 1 }],
          },
        ],
      },
    ],
    [
      'gathering_idが0',
      {
        rounds: [
          {
            round: 1,
            gatherings: [
              {
                gathering_id: 0,
                gathering_time: '10:00',
                gathering_spot_id: 1,
              },
            ],
          },
        ],
      },
    ],
    [
      'gathering_spot_idがない',
      { rounds: [{ round: 1, gatherings: [{ gathering_time: '10:00' }] }] },
    ],
    [
      'Round番号が重複',
      {
        rounds: [
          {
            round: 1,
            gatherings: [{ gathering_time: '10:00', gathering_spot_id: 1 }],
          },
          {
            round: 1,
            gatherings: [{ gathering_time: '10:30', gathering_spot_id: 1 }],
          },
        ],
      },
    ],
    [
      'gathering_idがRoundをまたいで重複',
      {
        rounds: [
          {
            round: 1,
            gatherings: [
              {
                gathering_id: 101,
                gathering_time: '10:00',
                gathering_spot_id: 1,
              },
            ],
          },
          {
            round: 2,
            gatherings: [
              {
                gathering_id: 101,
                gathering_time: '10:30',
                gathering_spot_id: 1,
              },
            ],
          },
        ],
      },
    ],
  ])('リクエストボディが%sの場合は400を返す', async (_label, body) => {
    const { service, request } = setup();

    const response = await request('/events/12/gatherings', body);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(service.saveEventGatheringSettings).not.toHaveBeenCalled();
  });

  // details は入れ子のパスを `rounds` にまとめるため、どの項目で失敗したかは
  // メッセージ本文でしか伝えられない。項目名が含まれることを固定する。
  it('入れ子の検証エラーは項目名を含むメッセージを details に載せる', async () => {
    const { request } = setup();

    const response = await request('/events/12/gatherings', {
      rounds: [
        {
          round: 0,
          gatherings: [
            { gathering_id: 5, gathering_time: '99:59', gathering_spot_id: 0 },
            { gathering_id: 5, gathering_time: '10:00', gathering_spot_id: 1 },
          ],
        },
        { round: 0, gatherings: [] },
      ],
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as {
      error: { details: { fieldErrors: Record<string, string[]> } };
    };
    expect(body.error.details.fieldErrors.rounds).toEqual(
      expect.arrayContaining([
        'round must be an integer between 1 and 99',
        'gathering_time must be in HH:mm format',
        'gathering_spot_id must be a positive integer',
        'gathering_id must not contain duplicate values',
        'gatherings must contain at least one item',
        'round must not contain duplicate values',
      ])
    );
  });

  it('境界値の 00:00 / 23:59 と round 1 / 99 は受け付ける', async () => {
    const { service, request } = setup();

    const response = await request('/events/12/gatherings', {
      rounds: [
        {
          round: 1,
          gatherings: [{ gathering_time: '00:00', gathering_spot_id: 1 }],
        },
        {
          round: 99,
          gatherings: [{ gathering_time: '23:59', gathering_spot_id: 1 }],
        },
      ],
    });

    expect(response.status).toBe(200);
    expect(service.saveEventGatheringSettings).toHaveBeenCalled();
  });

  it.each([
    ['Event not found', 404, 'EVENT_NOT_FOUND', '競技が見つかりません'],
    [
      'Gathering not found',
      404,
      'GATHERING_NOT_FOUND',
      '集合グループが見つかりません',
    ],
    [
      'Gathering spot not found',
      404,
      'GATHERING_SPOT_NOT_FOUND',
      '集合場所が見つかりません',
    ],
    [
      'Gathering in use',
      409,
      'GATHERING_IN_USE',
      '参加者がいる集合グループは削除できません',
    ],
  ])(
    'サービスが %s を投げた場合は %s を返す',
    async (thrownMessage, status, code, message) => {
      const { request } = setup({
        saveEventGatheringSettings: vi
          .fn()
          .mockRejectedValue(new Error(thrownMessage)),
      });

      const response = await request('/events/12/gatherings', validBody);

      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: { code, message } });
    }
  );

  it('予期しないエラーの場合は500を返し、内部エラーの詳細を応答に含めない', async () => {
    const { request } = setup({
      saveEventGatheringSettings: vi
        .fn()
        .mockRejectedValue(new Error('D1_ERROR: no such table: gatherings')),
    });
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);

    const response = await request('/events/12/gatherings', validBody);

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: {
        code: 'EVENT_GATHERINGS_UPDATE_FAILED',
        message: '競技の集合設定の更新に失敗しました',
      },
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
