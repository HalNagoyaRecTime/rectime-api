import { execFileSync } from 'node:child_process';
import { FCM_SETTING_NAMES } from '../../src/infrastructure/services/FcmConfiguration.ts';

// Secretの値は取得せず、デプロイ対象Workerの登録名だけを検証する。
const args = process.argv.slice(2);
if (
  args.length !== 0 &&
  !(
    args.length === 2 &&
    args[0] === '--env' &&
    ['development', 'staging'].includes(args[1])
  )
) {
  throw new Error(
    '引数は --env development または --env staging を指定してください。本番は引数なしです。'
  );
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
