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
          configPath: './wrangler.jsonc',
          environment: 'development',
        },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/apply-migrations.ts'],
      forceRerunTriggers: [
        '**/package.json',
        '**/package-lock.json',
        '**/vitest.config.*',
        '**/vite.config.*',
        '**/tsconfig*.json',
        '**/wrangler.jsonc',
        'migrations/**',
      ],
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
