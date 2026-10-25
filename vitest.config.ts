import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import {
  cloudflareTest,
  readD1Migrations,
} from '@cloudflare/vitest-pool-workers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(async () => {
  // migrations/ の SQL を読み込み、テストWorkerにバインディング経由で渡す
  const migrations = await readD1Migrations(path.join(__dirname, 'migrations'));

  return {
    plugins: [
      cloudflareTest({
        wrangler: {
          configPath: './wrangler-nagoya.jsonc',
          environment: 'development',
        },
        remoteBindings: false,
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            R2_ACCESS_KEY_ID: 'test-access-key-id',
            R2_SECRET_ACCESS_KEY: 'test-secret-access-key',
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      coverage: {
        // workerd ランタイムでは V8 のカバレッジ計測APIが使えないため istanbul を使用する
        provider: 'istanbul',
        reporter: ['text', 'html'],
        include: ['src/**/*.ts'],
        exclude: [
          'src/index.ts',
          'src/vitest-env.d.ts',
          'src/types/**',
          'src/di/**',
          'src/infrastructure/database/schema.ts',
        ],
      },
    },
  };
});
