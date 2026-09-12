import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { app } from '../../../src/index';

// 生成されたOpenAPIドキュメントを検証する。ルート定義そのものをimportして
// 確かめると定義の写経になるため、実際に登録された結果を読む。
type Operation = {
  responses: Record<string, { content?: Record<string, { schema?: unknown }> }>;
};

type Schema = {
  required?: string[];
  properties?: Record<string, unknown>;
  allOf?: unknown[];
};

const PATH = '/api/v1/events/{eventId}';

describe('Event詳細取得APIのOpenAPI定義', () => {
  let operation: Operation;
  let schemas: Record<string, Schema>;

  beforeAll(async () => {
    const res = await app.fetch(
      new Request('http://example.com/openapi.json'),
      env
    );
    const document = (await res.json()) as {
      paths: Record<string, Record<string, Operation>>;
      components: { schemas: Record<string, Schema> };
    };
    operation = document.paths[PATH].get;
    schemas = document.components.schemas;
  });

  it('200はEventDetailを返す', () => {
    expect(
      operation.responses['200'].content?.['application/json']?.schema
    ).toEqual({ $ref: '#/components/schemas/EventDetail' });
  });

  // Eventを$refで取り込む形にしておくと、既存fieldの追随漏れが構造上起きない。
  it('EventDetailはEventを取り込んだうえでroundsを必須にする', () => {
    expect(schemas.EventDetail?.allOf).toEqual([
      { $ref: '#/components/schemas/Event' },
      {
        type: 'object',
        required: ['rounds'],
        properties: {
          rounds: {
            type: 'array',
            items: { $ref: '#/components/schemas/RoundSetting' },
          },
        },
      },
    ]);
  });

  // 集合設定の保存APIと同じcomponentを参照させ、Read/Writeで構造がずれないようにする。
  it('roundsの構造は集合設定APIと同じschemaを使う', () => {
    expect(schemas.RoundSetting).toMatchObject({
      required: ['round', 'gatherings'],
      properties: {
        gatherings: {
          type: 'array',
          items: { $ref: '#/components/schemas/GatheringSetting' },
        },
      },
    });
    expect(schemas.GatheringSetting).toMatchObject({
      required: [
        'gathering_id',
        'gathering_time',
        'gathering_spot',
        'member_count',
      ],
      properties: {
        gathering_spot: {
          $ref: '#/components/schemas/GatheringSpotSummary',
        },
      },
    });
  });

  it('一覧・作成・更新のレスポンスにはroundsを含めない', () => {
    expect(schemas.Event?.properties).not.toHaveProperty('rounds');
  });
});
