import { execFileSync } from 'node:child_process';
import { FCM_SETTING_NAMES } from '../../src/infrastructure/services/FcmConfiguration.ts';

// Secretの値は取得せず、デプロイ対象Workerの登録名だけを検証する。
const usage =
  '引数は --config <path> [--env development または --env staging] を指定してください。本番の--envは省略します。';
const args = process.argv.slice(2);
if (args[0] !== '--config' || typeof args[1] !== 'string') {
  throw new Error(usage);
}
const rest = args.slice(2);
if (
  rest.length !== 0 &&
  !(
    rest.length === 2 &&
    rest[0] === '--env' &&
    ['development', 'staging'].includes(rest[1])
  )
) {
  throw new Error(usage);
}
let names;
try {
  const output = execFileSync(
    'node_modules/.bin/wrangler',
    ['secret', 'list', '--format', 'json', ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const secrets = JSON.parse(output);
  if (
    !Array.isArray(secrets) ||
    !secrets.every(value => value && typeof value.name === 'string')
  )
    throw new Error();
  names = new Set(secrets.map(value => value.name));
} catch {
  throw new Error(
    '通知Secretの一覧を確認できませんでした。Cloudflareの認証・権限・対象Workerを確認してください。'
  );
}
const missing = FCM_SETTING_NAMES.filter(name => !names.has(name));
if (missing.length > 0)
  throw new Error(`通知Secretが未登録です: ${missing.join(', ')}`);
console.info(
  '通知Secretの登録名を確認しました。値の形式・送信権限・実配信の成功は別途確認してください。'
);
