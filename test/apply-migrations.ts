import { applyD1Migrations, env } from 'cloudflare:test';
import { beforeAll } from 'vitest';

// 各テストファイルの実行前に、テスト用 D1 へ migrations/ を適用する
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});
