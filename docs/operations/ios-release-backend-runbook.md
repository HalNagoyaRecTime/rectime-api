# iOSリリース向けBackend監視・障害対応Runbook

## 1. 目的

iOSリリース時に、認証・主要API・D1・デプロイで問題が発生した場合の確認順序と復旧判断を統一する。

このRunbookでは新しい監視サービスを導入せず、Cloudflare Dashboard、Workers Logs／Metrics、D1、GitHub Actions、Wranglerを利用する。

通知配信の機能検証は対象外とし、QueueはBackend全体の障害切り分けに必要な状態確認だけを扱う。

## 2. 重要な原則

- Token、Cookie、Authorization Header、Microsoft証明書、Secret、個人情報をIssue、PR、チャット、ログへ貼らない。
- productionへのMigration、Rollback、D1 Time Travel restoreは、担当者2名以上で対象と時刻を確認してから実行する。
- 障害調査中にDashboard上のBindingやSecretを直接変更しない。恒久対応はRepositoryの設定とPRを正とする。
- まず影響を止め、証跡を残し、原因を特定してから復旧する。
- WorkerのRollbackではD1、KV、QueueなどのデータやBindingは元に戻らない。

## 3. 環境一覧

| 用途 | Worker | D1 | Queue | デプロイ契機 |
| --- | --- | --- | --- | --- |
| production | `rectime-api` | `rectime-api` | `rectime-notification-delivery` | `main`でDeploy Workflowを手動実行した場合のみ |
| staging | `rectime-api-staging` | `rectime-api-staging` | `rectime-notification-delivery-staging` | `main`へのpush |
| development | `rectime-api-development` | `rectime-api-dev` | `rectime-notification-delivery-dev` | `develop`へのpush／PRごとのプレビュー |

> `main`へのpushはstagingへ反映される。productionへ反映するには、`main`でDeploy Workflowを手動実行する必要がある。

### プレビュー環境について

旧preview環境は廃止済みで、PRごとのプレビューはdevelopment環境へ統合されている。PRごとに`pr-<番号>-rectime-api-development.<subdomain>.workers.dev`が払い出され、D1、KV、Queueはdevelopment環境と共用する。

- プレビュー専用の保存領域を新規作成しない
- 存在しないPreview BindingのDashboard上での応急追加
- 障害調査時は、環境一覧と`wrangler.jsonc`、`.github/workflows/deploy.yml`が一致していることを確認する

## 4. 権限と担当

### 初動担当

- Backend担当: Workers、D1、Migration、認証設定の確認
- Mobile担当: iOSで発生した操作、時刻、Endpoint、HTTP Statusの記録
- リリース担当: TestFlight／App Store Connectの状態と影響範囲の確認

### 連絡が必要な基準

以下のいずれかに該当した場合は、個人判断でproductionを変更せず、チームへ連絡する。

- `/health`が2回連続で`200`以外になる
- 主要APIの`5xx`が複数ユーザーで再現する
- 正常なログイン操作で`401`が継続する
- D1 schema不足、Migration失敗、データ破損の疑いがある
- production deploy後に既存Android／Web機能が利用できない
- Secret、Token、個人情報がログへ出力された可能性がある

## 5. リリース前の確認

### 5.1 RepositoryとCI

1. 対象Commit SHAとリリース担当者を記録する。
2. CIの`format:check`、`lint`、`type-check`、`test`が成功していることを確認する。
3. Deploy Workflowの対象branch、Worker、D1が想定どおりであり、本Runbookの環境一覧と`wrangler.jsonc`、`.github/workflows/deploy.yml`が一致していることを確認する。
4. 未解決のBlocking Issueがないことを確認する。

### 5.2 Secretと環境変数

値そのものは表示・記録せず、Cloudflare DashboardのWorkers & Pagesから対象Workerを開き、Binding名と設定有無だけを確認する。

最低限確認する項目:

- `DB`
- `AUTH_KV`
- `MASTER_IMPORT_COMMIT_LOCK`
- Microsoft認証関連Secret
- `JWT_SECRET`とToken期限関連設定
- `ALLOWED_ORIGINS`
- `FRONTEND_URL`
- `EVENT_DATE`

確認結果は`設定あり／なし`だけを記録し、Secret値や暗号化前の内容は残さない。

`EVENT_DATE`はSecretではないため、値が`YYYY-MM-DD`形式で設定され、実際のイベント開催日（JST）と一致していることまで確認する。未設定、不正な形式、または開催日の誤りがある場合、自動通知を生成するイベント更新が失敗し、Cronによる通知配信も停止する。

### 5.3 D1 Migration

適用前に以下を確認する。

```shell
npx wrangler d1 migrations list rectime-api --remote
npx wrangler d1 time-travel info rectime-api
```

記録するもの:

- 未適用Migration名
- 実行予定時刻
- 実行担当者
- Time Travel bookmark
- 対象Databaseが`rectime-api`であること

MigrationはGitHub ActionsのDeploy Workflowを基本とし、productionへローカル端末から直接適用しない。

## 6. Smoke Test

### 6.1 認証不要Health Check

```shell
curl --fail-with-body --silent --show-error \
  https://rectime-api.rectime-project.workers.dev/health
```

期待結果:

```json
{"status":"ok"}
```

### 6.2 認証API

iOSでMicrosoftログイン後、Token値を画面やログへ出力せずに以下を確認する。

1. `/api/v1/auth/me`が`200`を返す。
2. ユーザーIDと表示名がログインユーザーと一致する。
3. App再起動後もSessionが復元できる。
4. Logout後は同じ認証必須APIが`401`になる。

### 6.3 代表API

Bearer Tokenを安全なローカル環境変数へ一時設定し、履歴に残さない端末で実行する。

```shell
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Client-Type: mobile" \
  https://rectime-api.rectime-project.workers.dev/api/v1/auth/me

curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "X-Client-Type: mobile" \
  https://rectime-api.rectime-project.workers.dev/api/v1/events
```

実行後は環境変数を破棄する。

```shell
unset ACCESS_TOKEN
```

## 7. 障害の確認順序

### 7.1 Worker全体

1. `/health`のHTTP Statusを確認する。
2. Cloudflare Dashboardで対象WorkerのMetricsを開く。
3. Request数、Error率、CPU時間、実行時間の変化を確認する。
4. Workers LogsまたはReal-time Logsで同時刻のexceptionと`5xx`を確認する。

CLIで一時的に確認する場合:

```shell
npx wrangler tail rectime-api --format pretty
```

ログをIssueへ貼る場合は、Authorization Header、Cookie、Token、メールアドレス、氏名を必ず削除する。

### 7.2 Microsoft認証と401増加

確認順序:

1. iOSだけ、Androidだけ、Webも含む全Clientのどこで発生するか確認する。
2. `X-Client-Type: mobile`が送信されているか確認する。
3. Microsoft Callback URLとMobile Redirect URIの登録先を確認する。
4. Microsoft関連Secretと`JWT_SECRET`が対象Workerに設定されているか、名前と設定有無だけを確認する。
5. `INVALID_TOKEN`、`SESSION_EXPIRED`などのエラーコードを確認する。
6. Token本文をデコード結果を含めて共有しない。

### 7.3 API 5xx

1. 発生時刻、Endpoint、HTTP Method、Status、request IDがあれば記録する。
2. 同じEndpointをdevelopment／stagingで再現できるか確認する。
3. Workers Logsのexceptionと直前のDeploy SHAを照合する。
4. D1エラーの場合はMigration状態とテーブル存在を確認する。
5. 外部サービス障害の場合はMicrosoft／Firebase／CloudflareのStatusを確認する。

### 7.4 D1 schema不整合

まず読み取りだけを行う。

```shell
npx wrangler d1 migrations list rectime-api --remote
npx wrangler d1 execute rectime-api --remote \
  --command "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;"
```

Repositoryの`migrations/`、適用済みMigration、実テーブルを比較する。手動DDLで修正せず、原因となるMigrationと適用経路を確認する。

### 7.5 イベント更新・通知配信の停止

イベント時刻の更新または通知配信が失敗している一方で、`/health`が正常な場合は、対象Workerの`EVENT_DATE`を確認する。

1. Cloudflare Dashboardで対象WorkerのSettingsからVariables and Secretsを開く。
2. `EVENT_DATE`が設定されていることを確認する。
3. 値が`YYYY-MM-DD`形式であることを確認する。
4. 値が実際のイベント開催日（JST）と一致していることを確認する。
5. Workers Logsで`EVENT_DATE is not configured correctly`または通知配信停止の警告がないことを確認する。

値を変更する必要がある場合は、対象環境と開催日を担当者2名で確認し、変更後にイベント更新と通知予定作成を再確認する。

## 8. Queue状態の確認

通知機能自体のE2EはこのRunbookの対象外だが、Queue backlogがWorker障害の原因かを確認する。

Cloudflare DashboardのQueuesから以下を確認する。

- backlog message数
- consumer error
- retry回数
- consumer concurrency

backlogが増加し続ける場合、consumerを無計画に再デプロイしたりメッセージを削除せず、WorkerのexceptionとD1の状態を先に確認する。

## 9. Deploy失敗とRollback

### 9.1 Deploy失敗

1. GitHub Actionsの失敗Stepを確認する。
2. Migration失敗かWorker Deploy失敗かを分ける。
3. Migrationが未実行なら再実行前に原因を修正する。
4. Migration適用後にWorker Deployだけ失敗した場合、schemaと稼働中Workerの互換性を確認する。
5. 同じWorkflowを根拠なく連続再実行しない。

### 9.2 Worker Rollback

Rollbackはproductionを即時変更するため、必ず担当者2名で対象Versionを確認する。

```shell
npx wrangler deployments list --name rectime-api
npx wrangler rollback <VERSION_ID> \
  --name rectime-api \
  --message "Rollback: <理由とIssue番号>"
```

注意:

- Worker RollbackではD1 data／schema、KV、Queueは戻らない。
- 旧Workerが現在のD1 schemaと互換性を持つか確認する。
- Binding先Resourceが削除・変更されている場合、Rollbackできないことがある。
- Rollback後に`/health`、`/api/v1/auth/me`、代表APIを再確認する。

### 9.3 D1 Restore

D1 Time Travel restoreは破壊的操作であり、通常の障害対応では実行しない。データ破損が確認され、チーム承認を得た場合のみ実施する。

```shell
npx wrangler d1 time-travel info rectime-api --timestamp "<RFC3339>"
npx wrangler d1 time-travel restore rectime-api --bookmark "<BOOKMARK>"
```

実行前に現在のbookmarkも記録する。これによりrestoreを取り消す必要が生じた場合の戻り先を保持する。

## 10. iOSリリース当日Checklist

### リリース前

- [ ] 対象Commit SHAと担当者を記録した
- [ ] CIがすべて成功している
- [ ] 本Runbookの環境一覧が`wrangler.jsonc`と`.github/workflows/deploy.yml`に一致している
- [ ] Deploy対象Worker／D1を確認した
- [ ] 未適用Migrationを確認した
- [ ] production D1のTime Travel bookmarkを記録した
- [ ] Secret／Bindingの名前と設定有無を確認した
- [ ] `EVENT_DATE`が`YYYY-MM-DD`形式で実際のイベント開催日（JST）と一致している
- [ ] `main`でDeploy Workflowを手動実行し、production環境で成功したことを確認した
- [ ] `npx wrangler deployments list --name rectime-api`で対象Commit SHAがproductionへ反映されていることを確認した
- [ ] `/health`が`200`を返す
- [ ] iOSログインと`/api/v1/auth/me`が成功する
- [ ] イベント一覧／詳細を取得できる
- [ ] Android／Webの主要認証に回帰がない

### リリース後

- [ ] Workers Metricsで`5xx`増加がない
- [ ] 正常ログインで`401`が増加していない
- [ ] D1 schema errorがない
- [ ] iOSを再起動してSessionを復元できる
- [ ] Logout後に再ログインできる
- [ ] 障害連絡先とRollback判断者が待機している

## 11. 実施記録Template

```text
実施日時(JST):
実施者:
環境:
Commit SHA:
Worker:
D1:
Health Check:
認証Smoke Test:
代表API Smoke Test:
Workers Logs／Metrics:
Migration状態:
EVENT_DATE確認:
D1 bookmark:
残課題:
Rollback判断者:
```

## 12. 現時点の残作業

- [ ] development環境でSmoke Testを実行する
- [ ] staging環境で本Runbookを1回通して実施記録を残す
- [ ] production設定は値を公開せずBindingとEndpointだけ確認する

## 13. 参考資料

- Cloudflare Workers Logs: https://developers.cloudflare.com/workers/observability/logs/workers-logs/
- Cloudflare Real-time Logs: https://developers.cloudflare.com/workers/observability/logs/real-time-logs/
- Cloudflare Workers Rollback: https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/
- Cloudflare D1 Time Travel: https://developers.cloudflare.com/d1/reference/time-travel/
- Cloudflare Queues Metrics: https://developers.cloudflare.com/queues/observability/metrics/
