import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';

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
    },
  };
});
