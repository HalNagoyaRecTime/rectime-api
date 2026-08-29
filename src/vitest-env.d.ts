/// <reference types="@cloudflare/vitest-pool-workers/types" />

import type { Env as AppEnv } from './lib/env';
import type { D1Migration } from '@cloudflare/vitest-pool-workers';

// pool 0.16.x では `cloudflare:test` の `env` が `Cloudflare.Env` 型になるため、
// アプリの Env 型をグローバルの Cloudflare.Env に橋渡しする。
declare global {
  namespace Cloudflare {
    interface Env extends AppEnv {
      // vitest.config.ts から注入される migrations/ の内容
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}
