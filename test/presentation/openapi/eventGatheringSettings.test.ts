import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/index';

// 生成されたOpenAPIドキュメントを検証する。ルート定義そのものをimportして
// 確かめると定義の写経になるため、実際に登録された結果を読む。
type Operation = {
  tags?: string[];
  security?: unknown;
  parameters?: { name: string; in: string; required?: boolean }[];
  responses: Record<string, { content?: Record<string, unknown> }>;
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: unknown }>;
  };
};

const PATH = '/api/v1/events/{eventId}/gatherings';

describe('集合設定保存APIのOpenAPI定義', () => {
  let operations: Record<string, Operation>;
  let schemas: Record<string, unknown>;

  beforeAll(async () => {
    const res = await app.fetch(
      new Request('http://example.com/openapi.json'),
      env
    );
    const document = (await res.json()) as {
      paths: Record<string, Record<string, Operation>>;
      components: { schemas: Record<string, unknown> };
    };
    operations = document.paths[PATH];
    schemas = document.components.schemas;
  });

  it('既存のGETと同じパスにPUTを追加する', () => {
    expect(Object.keys(operations).sort()).toEqual(['get', 'put']);
  });

  it('PUTは保存後の集合設定を200で返し、契約どおりのエラーを定義する', () => {
    const operation = operations.put;

    expect(Object.keys(operation.responses).sort()).toEqual([
      '200',
      '400',
      '401',
      '403',
      '404',
      '409',
      '500',
    ]);
    expect(operation.responses['200'].content).toHaveProperty(
      'application/json'
    );
  });

  it('PUTはJSON本文を必須にする', () => {
    const body = operations.put.requestBody;

    expect(body?.required).toBe(true);
    expect(body?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/EventGatheringSettingsWriteRequest',
    });
  });

  // リクエスト全体の検証(superRefine)を挟んでも、schemaの構造が文書から
  // 抜け落ちないことを確認する。
  it('リクエストschemaにroundsの構造が含まれる', () => {
    expect(schemas.EventGatheringSettingsWriteRequest).toMatchObject({
      type: 'object',
      required: ['rounds'],
      properties: {
        rounds: {
          type: 'array',
          items: { $ref: '#/components/schemas/RoundSettingInput' },
        },
      },
    });
    expect(schemas.RoundSettingInput).toMatchObject({
      required: ['round', 'gatherings'],
      properties: {
        round: { type: 'integer', minimum: 1, maximum: 99 },
        gatherings: { type: 'array', minItems: 1 },
      },
    });
    expect(schemas.GatheringSettingInput).toMatchObject({
      required: ['gathering_time', 'gathering_spot_id'],
      properties: {
        gathering_time: { type: 'string', example: '10:45' },
      },
    });
  });

  it('リクエストとレスポンスのschemaがcomponentsに登録される', () => {
    expect(Object.keys(schemas)).toEqual(
      expect.arrayContaining([
        'EventGatheringSettingsWriteRequest',
        'RoundSettingInput',
        'GatheringSettingInput',
        'EventGatheringSettings',
        'RoundSetting',
        'GatheringSetting',
        'GatheringSpotSummary',
      ])
    );
  });

  it('PUTはBearer認証を要求する', () => {
    expect(operations.put.security).toEqual([{ Bearer: [] }]);
  });

  it('PUTはeventIdをパスパラメータに取る', () => {
    expect(operations.put.parameters).toEqual([
      expect.objectContaining({ name: 'eventId', in: 'path', required: true }),
    ]);
  });
});
