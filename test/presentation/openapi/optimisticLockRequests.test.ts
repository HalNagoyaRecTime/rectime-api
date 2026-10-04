import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../../../src/index';

type JsonSchema = {
  allOf?: unknown[];
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

async function loadSchemas(): Promise<Record<string, JsonSchema>> {
  const res = await app.fetch(
    new Request('http://example.com/openapi.json'),
    env
  );
  const document = (await res.json()) as {
    components: { schemas: Record<string, JsonSchema> };
  };
  return document.components.schemas;
}

// 登録済みのスキーマを allOf で合成すると、基底側の additionalProperties: false が
// 更新時刻を、拡張側が基底の項目を拒否し、どの本文も満たせない仕様になる。
describe('更新リクエストのOpenAPIスキーマ', () => {
  it.each([
    ['ClassRoomWriteRequest', 'ClassRoomUpdateRequest', 'updatedAt'],
    ['StudentWriteRequest', 'StudentUpdateRequest', 'updated_at'],
  ])(
    '%s に更新時刻を足した %s は、allOf を使わず1つのオブジェクトとして出力される',
    async (writeName, updateName, field) => {
      const schemas = await loadSchemas();
      const write = schemas[writeName];
      const update = schemas[updateName];

      expect(update.allOf).toBeUndefined();
      expect(update.additionalProperties).toBe(false);
      expect(Object.keys(update.properties ?? {}).sort()).toEqual(
        [...Object.keys(write.properties ?? {}), field].sort()
      );
      expect(update.required).toEqual(write.required);
      expect(write.properties).not.toHaveProperty(field);
    }
  );

  it('教員の更新リクエストは updatedAt を任意の項目として持つ', async () => {
    const update = (await loadSchemas()).TeacherUpdateRequest;

    expect(update.properties).toHaveProperty('updatedAt');
    expect(update.required).not.toContain('updatedAt');
  });
});
