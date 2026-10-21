# Backend運用手順のstaging確認記録

関連: #247。stagingで確認できる項目を実施した部分記録。IssueはCloseしない。

## 対象

- 実施日: 2026-10-21 JST。
- コード確認対象: develop `0f7007a5`。
- 実際のWorkerのデプロイSHA: 未確認。
- 環境: staging。接続先はRunbookとRepositoryの環境設定から選択した。
- デプロイ、Migration適用、Rollback、D1 restore、Secret変更、通知配信は実施していない。

## 実施結果

| 項目 | 結果 | 根拠と限界 |
| --- | --- | --- |
| GET /health | 成功 | HTTP 200、JSONのstatus=ok |
| TokenなしのGET /api/v1/auth/me | 成功 | HTTP 401、UNAUTHORIZED |
| 合成無効TokenのGET /api/v1/auth/me | 成功 | HTTP 401、INVALID_TOKEN |
| 認証済みGET | 未実施 | 実際のiOSログインで発行したTokenを使用していない |
| Secret登録名の取得 | 確認不可 | `wrangler secret list --env staging --format json`はCloudflare認証が必要で失敗。値は取得していない |
| Workers Logs / Metrics | 未実施 | Cloudflare管理APIの認証・権限確認が必要 |
| D1 Migration / bookmark | 未実施 | 同上。healthの成功から推測しない |
| Queue backlog / consumer error | 未実施 | 同上。キュー操作は行っていない |
| Rollback・restore | 未実施 | 今回は読み取り確認のみ。障害を発生させる試験はしていない |

`npm run backend:smoke`の結果は以下。Tokenを使わない確認を全て成功しても、
運用手順全体の完了として扱わない。

```json
{
  "result": "partial",
  "authenticated": "not_run",
  "passed": true
}
```

## 自動検証

- Smoke Testスクリプト: 13 tests成功。Tokenなしのpartial判定、不正な応答、通信失敗、認証済み401、出力へのToken混入防止、origin検証を確認。
- `npm run format:check`、`npm run lint`、`npm run type-check`: 成功。
- `npm test`: 183 files / 2,033 tests成功。

## 再実行

1. Runbookの環境一覧とデプロイ設定から対象originを選び、`BACKEND_SMOKE_BASE_URL`へ設定する。
2. `npm run backend:smoke`を実行する。
3. 必要なら実機で取得したTokenを保護されたRepository外の一時ファイルから読み込み、認証済みGETを確認する。
4. 管理権限のある担当者がstagingのデプロイSHA、登録Secret名、Binding、Logs / Metrics、D1、Queueを読み取り確認する。
5. 確認者と実施日時を記録し、確認済み項目だけ更新する。

実ユーザーのToken、氏名、メールアドレス、環境設定値、Cloudflare account情報は記録しない。

## 残る完了条件

- [ ] 対象Workerの稼働VersionとCommit SHAを確認する。
- [ ] stagingのSecret / Binding名と設定有無を確認する。
- [ ] EVENT_DATEが設定され、開催日と一致することを担当者が確認する。
- [ ] stagingで実ログイン後の代表APIを確認する。
- [ ] Workers Logs / Metrics、D1 Migration、Queue状態の確認手順を実行する。
- [ ] リリース当日の担当者・連絡先・Rollback判断者をチームで確定する。
- [ ] 実施記録を担当者が確認し、#247の完了を判断する。
