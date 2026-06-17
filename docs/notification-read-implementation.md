# 通知既読機能 実装まとめ

## 概要

通知機能に対して、モバイル利用者が通知の既読・未読状態を確認し、個別または一括で既読化できる機能を追加した。

現時点では認証ミドルウェアが未実装のため、利用者の判定は暫定的に `X-Student-Number` ヘッダー、または `studentNumber` / `student_number` クエリパラメータで行う。

## 追加・変更ファイル

### 追加

- `migrations/0005_add_notification_read_state.sql`
- `src/types/domains/Notification.ts`
- `src/repositories/NotificationRepository.ts`
- `src/services/NotificationService.ts`
- `docs/notification-read-implementation.md`

### 変更

- `docs/notification-requirements.md`
- `src/controllers/NotificationController.ts`
- `src/index.ts`
- `src/services/ScheduledNotificationService.ts`
- `src/types/controllers.ts`
- `src/types/domains/index.ts`
- `src/types/repositories.ts`
- `src/types/services.ts`

## DB 変更

`notifications` テーブルに以下のカラムを追加した。

| カラム | 用途 |
| --- | --- |
| `user_id` | 通知対象ユーザー |
| `link_url` | アプリ内遷移先 |
| `resource_type` | 関連リソース種別 |
| `resource_id` | 関連リソース ID |
| `severity` | 通知重要度 |
| `send_status` | 送信状態 |
| `sent_at` | 送信日時 |
| `read_at` | 既読日時。`NULL` の場合は未読 |
| `updated_at` | 更新日時 |

追加 index:

- `idx_notifications_user_created_at`
- `idx_notifications_user_read_at`

## 既読判定

- `read_at IS NULL` の通知を未読とする
- `read_at IS NOT NULL` の通知を既読とする
- API レスポンスでは `is_read` を `read_at` から算出して返す
- 個別既読 API は既読済み通知に対しても正常終了し、既存の `read_at` を更新しない
- 一括既読 API はログイン利用者相当の未読通知のみを対象にする

## 追加 API

### GET /api/v1/notifications

通知一覧を取得する。

利用者指定:

- `X-Student-Number` ヘッダー
- または `studentNumber` / `student_number` クエリパラメータ

クエリ:

| パラメータ | 説明 |
| --- | --- |
| `read_status` | `all` / `read` / `unread`。省略時は `all` |
| `limit` | 取得件数。省略時は 20、最大 100 |
| `offset` | 取得開始位置。省略時は 0 |

実行例:

```powershell
curl.exe "http://localhost:8787/api/v1/notifications?read_status=unread" `
  -H "X-Student-Number: 24A001"
```

### GET /api/v1/notifications/unread-count

未読通知件数を取得する。

実行例:

```powershell
curl.exe http://localhost:8787/api/v1/notifications/unread-count `
  -H "X-Student-Number: 24A001"
```

レスポンス例:

```json
{
  "unread_count": 3
}
```

### PATCH /api/v1/notifications/{id}/read

指定した通知を既読化する。

実行例:

```powershell
curl.exe -X PATCH http://localhost:8787/api/v1/notifications/1/read `
  -H "X-Student-Number: 24A001"
```

レスポンス例:

```json
{
  "notification_id": 1,
  "is_read": true,
  "read_at": "2026-06-17 12:00:00"
}
```

### PATCH /api/v1/notifications/read-all

利用者自身の未読通知をすべて既読化する。

実行例:

```powershell
curl.exe -X PATCH http://localhost:8787/api/v1/notifications/read-all `
  -H "X-Student-Number: 24A001"
```

レスポンス例:

```json
{
  "updated_count": 3,
  "read_at": "2026-06-17T12:00:00.000Z"
}
```

## 定期通知との連携

`sendScheduledEventNotifications` を変更し、イベント開始10分前通知を送信する際に `notifications` テーブルへ通知履歴を保存するようにした。

送信状態は以下の流れで更新する。

- 通知履歴作成時: `pending`
- FCM 送信成功時: `sent`
- FCM 送信失敗時: `failed`

同一ユーザー・同一イベント・同一日付の通知履歴は重複作成しない。

## 動作確認

以下を実行済み。

```powershell
npm run type-check
```

結果: 成功

```powershell
npm run lint
```

結果: 成功。ただし既存の warning が2件残っている。

- `src/repositories/EntryRepository.ts`
- `src/types/controllers.ts`

```powershell
npm run "db:migrate --local"
```

結果: 成功。ローカル D1 に `0005_add_notification_read_state.sql` まで適用済み。

## 今後の注意点

- 認証機能が入ったら、`X-Student-Number` / クエリ指定ではなく認証済みユーザー情報から `studentNumber` を取得する形に差し替える
- 管理画面向けの通知作成 API が追加された場合は、作成時に `notifications.user_id` を設定する
- 既存の `notifications` テーブルにユーザー未紐づけの古い通知がある場合、一覧 API では取得対象外になる
