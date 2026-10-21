# 正式スケジュールと仮Roundの登録（Issue #552）

## 登録内容

`operations/official-schedule-2026.sql` を明示実行して登録する。デプロイ時に自動適用されるmigrationには含めない。初期ダミーデータの削除は、#553の `0047_remove_initial_dummy_data.sql` を各対象環境へ適用して検証する。

| 時刻・締切（JST） | スケジュール | 仮の集合時間 |
| --- | --- | --- |
| 10:00締切 | 出席確認① | — |
| 10:00〜10:20 | 開会式 | — |
| 10:30〜11:30 | 第一競技「走れ！○人○脚！」 | 10:20 |
| 11:30〜13:00 | 第二競技「ドッジボール」 | 11:20 |
| 13:00〜14:00 | 昼休憩＋コスプレ大会 | — |
| 13:30締切 | 出席確認② | — |
| 14:00〜15:00 | 第三競技「紙飛行機飛ばし」 | 13:50 |
| 15:00〜15:30 | 第四競技「学科別対抗リレー」 | 14:50 |
| 15:40締切 | 出席確認③ | — |
| 15:40〜16:00 | 表彰式・閉会式 | — |

出席確認は `start_time = end_time` で締切を表し、`rule_text`にも締切を明記する。Event APIは同一時刻を受け付け、終了が開始より前の入力を拒否する。既存の名称や時刻の形式は維持する。

競技4件だけに `round = 1` の集合予定を1件ずつ登録する。`round_start_time` は競技開始の `HHmm`、`gathering_time` は10分前の `HH:mm`、集合場所は `未定（仮）`。参加者は追加しない。開会式には「諸注意説明、競技誘導」、昼休憩には「当日の審査は8チームで実施」を記録する。

開催日は **2026年11月27日（金）**。本番用 `wrangler.jsonc` の `EVENT_DATE` に `2026-11-27` を設定する。developmentとstagingは検証用の日付を維持する。`EVENT_DATE` は通知を許可する開催日でもあるため、本番リリース後の実Workerと `GET /api/v1/events` の `event_date` で反映を確認する。

表に記載のない正式な実施場所、競技ルールは推測しない。新規Eventの実施場所は未設定、競技ルールはNULLとする。既存の実施場所とルールは保持する。正式場所が決まったら既存Event APIで会場とともに更新する（APIの `venue_ids` は1件以上必要）。

## 既存データがある場合

- 同名Eventが1件だけあり、開始・終了が表と一致する場合は、そのID・ルール・実施場所を保持して不足分を追加する。
- 同名Eventが複数ある、時刻が異なる、競技以外にRoundがある、競技の集合が期待値と違う、参加者がいる場合は全体を停止する。
- 集合場所 `未定（仮）` は0件なら作成、1件なら再利用する。同名が複数あれば停止する。
- 同じSQLの再実行では既存Event・集合を更新・再採番しない。正式Roundへ更新後の再実行は停止する。

停止した場合は対象IDと内容を確認し、既存の正規データをどう扱うかを確定する。ガードの削除や条件緩和で強行しない。

## 適用前の確認

1. #553のstaging検証結果と、対象環境の0047適用・ダミーデータ削除結果を確認する。本番でもstagingで検証した同じ削除migrationを使う。
2. 締切対応を含むAPIを対象環境へ反映する。表示クライアントでも同一時刻を締切として表示できるか確認する。
3. 対象DB、適用commit、実行日時、復元時刻を確認する。productionは[既存Runbook](ios-release-backend-runbook.md)に従い担当者2名で確認する。
4. D1 Time Travel bookmarkを実際に取得して、環境・取得日時・適用commitとともに非公開の実施記録へ保存する。コマンドを用意しただけでは取得済みにしない。
5. 最新exportのコピーで登録SQLを事前実行し、許可した追加以外の差分がないことを確認する。export・個人情報・bookmarkはリポジトリへ保存しない。

以下はstagingの例。productionは対象を明示して担当者と実行手段を確認し、`--env staging` を外して `DB` を本番DB名 `rectime-api` に置き換える。

```bash
npx wrangler d1 migrations list DB --remote --env staging
npx wrangler d1 time-travel info DB --env staging --json

schedule_snapshot_dir="$(mktemp -d)"
chmod 700 "$schedule_snapshot_dir"
npx wrangler d1 export DB --remote --env staging \
  --output "$schedule_snapshot_dir/before.sql"
```

exportに成功したことを確認してから、コピーで検証する。

```bash
/usr/bin/sqlite3 -bail "$schedule_snapshot_dir/check.sqlite" \
  < "$schedule_snapshot_dir/before.sql"

/usr/bin/sqlite3 "$schedule_snapshot_dir/check.sqlite" <<'SQL'
.bail on
PRAGMA foreign_keys = ON;
BEGIN;
.read operations/official-schedule-2026.sql
COMMIT;
.read operations/verify-official-schedule-2026.sql
SQL
```

事前結果を確認した担当者が、対象環境で登録する。SQL全体を1回で実行し、手作業で文ごとに分割しない。`BEGIN` / `COMMIT` はD1に送るファイルへ追加しない。テストでは[D1のbatchによる全体ロールバック](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)を検証する。

```bash
npx wrangler d1 execute DB --remote --env staging \
  --file operations/official-schedule-2026.sql
```

## 適用後の確認

```bash
npx wrangler d1 execute DB --remote --env staging \
  --command "$(cat operations/verify-official-schedule-2026.sql)" --json
```

- 最初の結果が10行で、すべて `registration_status = 正常` である。
- 次の結果が競技4件の集合で、Roundはすべて1、開始・集合時間は表どおり、集合場所は `未定（仮）`、参加者数は0である。
- 非競技6件にはRoundがない。正式な実施場所・競技ルールが未設定であることと、開催日が本番へ反映されていることを別に確認する。
- `foreign_key_check` が空で、登録対象外の全テーブル・行・列が適用前と一致する。
- Event一覧・詳細、集合設定画面で名称・時刻・締切・仮Roundを確認する。仮集合に参加者を登録する前に正式Round・場所を確定する。

SQLは通知履歴を直接作らない。対象環境のCronによる通常の同期は別に動くため、`EVENT_DATE`・通知設定と仮集合の運用時期を確認する。

実施記録は、削除migrationの適用、登録SQLの適用、確認結果、EVENT_DATE設定、UI確認をそれぞれ「実施済み／未実施」で分ける。Issueへの記録・本番反映は実際に実施した項目だけを完了にする。
