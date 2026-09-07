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
  requestBody?: unknown;
};

const PATH = '/api/v1/admin/users/{userId}/staff';

describe('staff権限APIのOpenAPI定義', () => {
  let operations: Record<string, Operation>;

  beforeAll(async () => {
    const res = await app.fetch(
      new Request('http://example.com/openapi.json'),
      env
    );
    const document = (await res.json()) as {
      paths: Record<string, Record<string, Operation>>;
    };
    operations = document.paths[PATH];
  });

  it('同じパスにPUTとDELETEを定義する', () => {
    expect(Object.keys(operations).sort()).toEqual(['delete', 'put']);
  });

  it.each(['put', 'delete'])(
    '%s は成功応答を本文なしの204で定義する',
    method => {
      const operation = operations[method];

      expect(Object.keys(operation.responses).sort()).toEqual([
        '204',
        '400',
        '401',
        '403',
        '404',
        '500',
      ]);
      // 204は本文を持たない。contentを定義するとクライアントが本文を期待する。
      expect(operation.responses['204'].content).toBeUndefined();
    }
  );

  it.each(['put', 'delete'])('%s はリクエスト本文を持たない', method => {
    expect(operations[method].requestBody).toBeUndefined();
  });

  it.each(['put', 'delete'])('%s はBearer認証を要求する', method => {
    expect(operations[method].security).toEqual([{ Bearer: [] }]);
  });

  it.each(['put', 'delete'])('%s はuserIdをパスパラメータに取る', method => {
    expect(operations[method].parameters).toEqual([
      expect.objectContaining({ name: 'userId', in: 'path', required: true }),
    ]);
  });
});
