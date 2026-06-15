# 作業ログ

このファイルは、バックエンド repo で実施した作業内容を日付ごとに記録するためのメモです。

## 2026-06-12

### 新 Cloudflare アカウントへの移行

Cloudflare アカウントを `rectime.project@gmail.com` 側へ切り替えた。

対応内容:

- Wrangler を新 Cloudflare アカウントで再ログイン
- `wrangler.jsonc` の `account_id` を新アカウントに変更
- 新アカウントに D1 database を作成
  - production: `rectime-api`
  - development: `rectime-api-dev`
- `wrangler.jsonc` の D1 binding を新 D1 に変更
- `package.json` の migration script を新 D1 名に変更
- production D1 に migration を適用
- 新 Worker にデプロイ

新 Worker URL:

```text
https://rectime-api.rectime-project.workers.dev
```

確認内容:

- `/` が正常に応答することを確認
- `/api/v1/students/1` で seed data を取得できることを確認
- `/api/v1/firebase-tokens` で production D1 に FCM Token を保存できることを確認
- `POST /api/v1/notifications/test` で FCM テスト通知を送信できることを確認

### 10 分前自動通知 MVP の追加

試合開始 10 分前に、スケジュールに合わせて自動で通知を送る MVP を追加した。

実装方針:

- Cloudflare Cron Trigger を利用
- cron は毎分実行
- JST の現在時刻 + 10 分と `t_events.f_time` が一致するイベントを対象にする
- 対象イベントが見つかったら、active な `firebase_tokens` に FCM 通知を送信
- 同じイベント・同じ token に同じ日の通知を複数回送らないように送信ログで制御

追加した migration:

- `migrations/0004_create_notification_send_logs.sql`

追加したテーブル:

- `notification_send_logs`

追加・変更した主なファイル:

- `src/services/ScheduledNotificationService.ts`
- `src/services/FcmService.ts`
- `src/index.ts`
- `src/types/services.ts`
- `wrangler.jsonc`
- `eslint.config.js`

追加した手動実行 API:

```http
POST /api/v1/notifications/schedule/run
```

mock 実行例:

```bash
curl -X POST https://rectime-api.rectime-project.workers.dev/api/v1/notifications/schedule/run \
  -H "Content-Type: application/json" \
  -d '{"now":"2026-06-12T01:50:00.000Z"}'
```

この `now` は JST 10:50 を表し、seed data の 11:00 開始イベントの 10 分前として検証した。

検証結果:

```json
{
  "checkedEvents": 1,
  "sent": 1,
  "failed": 1
}
```

結果の意味:

- `checkedEvents: 1` は 10 分後に開始するイベントを 1 件検出したこと
- `sent: 1` は実際の FCM Token への送信に成功したこと
- `failed: 1` は以前登録したテスト文字列 token が失敗したこと

D1 確認結果:

- 実際の FCM Token は `is_active = 1`
- テスト文字列 token は失敗後 `is_active = 0`
- `notification_send_logs` に成功送信ログが保存された
- FCM message id が保存された

### 現在の仕様メモ

今の自動通知は MVP 検証用で、対象者の絞り込みはまだ完全ではない。

現在:

- 10 分後に開始するイベントを探す
- active な `firebase_tokens` 全体へ通知を送る

次に修正するべき仕様:

- `t_events.f_event_id`
- `t_entries.f_event_id`
- `m_students.f_student_id`
- `m_students.f_student_num`
- `users.student_number`
- `firebase_tokens.user_id`

上記を JOIN して、該当イベントに参加するユーザーの token にだけ通知を送る。

想定 SQL:

```sql
SELECT ft.id, ft.fcm_token
FROM firebase_tokens ft
JOIN users u ON u.id = ft.user_id
JOIN m_students s ON s.f_student_num = u.student_number
JOIN t_entries e ON e.f_student_id = s.f_student_id
WHERE e.f_event_id = ?
  AND ft.is_active = 1
  AND u.is_active = 1;
```

### 次のステップ

- 自動通知の対象を「全 active token」から「該当イベント参加者の token」に変更
- Emulator を起動した状態で cron / mock API の Logcat 受信確認を行う
- `notification_send_logs` を使った重複送信防止を継続確認
- 必要であれば `notifications` テーブルへの通知本文保存も追加する

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

### Cloudflare デプロイ設定の修正

Cloudflare Workers Builds が古い `wrangler.jsonc` を参照していたため、Worker 名と D1 binding の不一致でデプロイに失敗していた。

確認されたエラー:

- Worker 名: `recreation-management-api` と `rectime-api` の不一致
- D1 binding: `rec_time_stg` の `database_id` が `00000000-0000-0000-0000-000000000000`

対応内容:

- Worker 名を `rectime-api` に修正
- Cloudflare `account_id` を設定
- 既存 D1 database `rec-time-be` を production の `DB` binding として利用
- local migration は既存 D1 database `rec-time-be-dev` を利用するように修正
- `npx wrangler deploy` で手動デプロイを実行

デプロイ結果:

- Worker: `rectime-api`
- URL: `https://rectime-api.ellan122316.workers.dev`
- D1 binding: `env.DB (rec-time-be)`
- Version ID: `a3be94b5-671f-48d2-a30f-9bc34f6e62b1`

### FCM Secret 登録と実送信確認

Cloudflare Secret に Firebase / FCM 用の値を登録した。

登録した Secret:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `TEST_FCM_TOKEN`

一度 `Google OAuth token request failed: invalid_grant` が発生したが、Firebase Service Account の値を再登録して解消した。

本番 Worker に対して次の API を実行した。

```bash
curl -X POST https://rectime-api.ellan122316.workers.dev/api/v1/notifications/test \
  -H "Content-Type: application/json" \
  -d '{"title":"test通知","body":"君に届け"}'
```

成功レスポンス:

```json
{
  "success": true,
  "messageId": "projects/rectime-3c0ba/messages/0:1781098147631193%df262460df262460"
}
```

Android Emulator の Logcat でも FCM 受信を確認した。

```text
D RectimeFCM: FCM message received from: 946149362229
```

### 完了したこと

- Cloudflare Worker から Firebase OAuth access token を発行できることを確認
- FCM HTTP v1 API へリクエストできることを確認
- Android Emulator の FCM Token 宛に通知を送信できることを確認
- Android アプリ側で FCM メッセージを受信できることを確認

### まだ必要な作業

- Android システム通知一覧で title/body が表示されるか追加確認
- Secret に利用した Firebase Service Account key は外部に出さない
- private key が露出した場合は Firebase Console で key を削除して再発行する

### Firebase Token 保存 API の追加

MVP の PDF 資料を確認し、通知用の DB 構成を `device_tokens` ではなく `users` / `firebase_tokens` / `notifications` に合わせた。

追加した migration:

- `migrations/0003_create_notification_mvp_tables.sql`

追加したテーブル:

- `users`
- `firebase_tokens`
- `notifications`

追加した API:

```http
POST /api/v1/firebase-tokens
```

リクエスト例:

```json
{
  "studentNumber": "24A001",
  "platform": "android",
  "token": "FCM_TOKEN"
}
```

処理内容:

- `studentNumber` をもとに `users` を作成または更新
- FCM Token を `firebase_tokens` に保存
- 同じ FCM Token が再登録された場合は新規作成せず、`last_seen_at` と `updated_at` を更新
- `fcmToken` と `token` のどちらのフィールド名でも受け付ける

ローカル D1 での検証:

- `users` / `firebase_tokens` / `notifications` migration の適用に成功
- `POST /api/v1/firebase-tokens` でテスト token の保存に成功
- Android アプリで発行された実際の FCM Token の保存に成功
- 不正な body `{}` に対して 400 validation エラーが返ることを確認

注意:

- 現時点で保存できているのはローカル D1
- remote D1 に保存するには、別途 `npm run "db:migrate --remote"` が必要
- 今の段階では remote migration は必須ではなく、フロントと配布環境で接続検証するタイミングで実行すればよい

### 次のステップ

- モバイルアプリから `POST /api/v1/firebase-tokens` を呼び出す
- remote D1 に migration を適用するタイミングを決める
- 保存済み `firebase_tokens.fcm_token` を使って FCM 送信できるようにする
- `UNREGISTERED` や invalid token などの失敗応答を処理する
