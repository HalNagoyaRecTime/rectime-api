# 作業ログ

このファイルは、バックエンド repo で実施した作業内容を日付ごとに記録するためのメモです。

## 2026-06-10

### FCM テスト通知送信 API の追加

現在のブランチ `feature/#14` で、既存の Cloudflare Workers / Hono 構成に FCM テスト通知送信用 API を追加した。

### 追加・修正内容

- `POST /api/v1/notifications/test` ルートを追加
- 通知リクエスト body のバリデーション用コントローラーを追加
- Firebase Service Account 情報を使って Google OAuth access token を生成する処理を追加
- FCM HTTP v1 API を呼び出して Android Emulator にテスト通知を送信する処理を追加
- FCM 関連の service / controller 型定義を追加
- Cloudflare Workers のグローバル API を ESLint が認識できるように設定を更新

### 主な対象ファイル

- `src/index.ts`
- `src/controllers/NotificationController.ts`
- `src/services/FcmService.ts`
- `src/types/services.ts`
- `src/types/controllers.ts`
- `eslint.config.js`

### 検証内容

- `npm run type-check` が成功することを確認
- `npm run format:check` が成功することを確認
- `npm run lint` がエラーなしで完了することを確認
- 既存の `any` 警告 2 件のみ残っていることを確認
- ローカル実行時、`/` のレスポンスに `testNotification` エンドポイントが表示されることを確認
- Cloudflare Secret 未設定時、`/api/v1/notifications/test` が不足している Secret 一覧を返すことを確認
- 不正な body `{}` を送信した場合、400 validation エラーが返ることを確認

### まだ必要な作業

実際に FCM へ送信するには、Cloudflare Secret に次の値を登録する必要がある。

```bash
npx wrangler secret put FIREBASE_PROJECT_ID
npx wrangler secret put FIREBASE_CLIENT_EMAIL
npx wrangler secret put FIREBASE_PRIVATE_KEY
npx wrangler secret put TEST_FCM_TOKEN
```

登録後、次の API を呼び出して Android Emulator で通知受信を確認する。

```bash
curl -X POST http://localhost:8787/api/v1/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"title":"test通知","body":"君に届け"}'
```

### 次のステップ

- Firebase Service Account の値を Cloudflare Secret に登録
- Android Emulator の FCM Token を `TEST_FCM_TOKEN` に登録
- `/api/v1/notifications/test` から実際に通知が届くことを確認
- 成功後、D1 を使った device token 保存 API の設計へ進む
