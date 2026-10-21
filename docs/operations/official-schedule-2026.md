# stagingイベントの本番登録（Issue #552）

## 目的

2026年10月22日時点のstaging recwatchに登録されているイベント構成を、本番へ再現する。
登録SQLは `operations/official-schedule-2026.sql`、確認SQLは
`operations/verify-official-schedule-2026.sql` を使用する。

デプロイ時に自動適用されるmigrationには含めない。初期ダミーデータは、#553の
`0047_remove_initial_dummy_data.sql` を対象環境へ適用して削除する。

## 登録内容

| 開催時間（JST） | イベント名 | 実施場所 | Round数 |
| --- | --- | --- | ---: |
| 09:30〜10:00 | 出席確認① | 未定（仮） | 0 |
| 10:00〜10:20 | 開会式 | 未定（仮） | 0 |
| 10:30〜11:30 | 走れ！○人○脚！ | コートC | 4 |
| 11:30〜13:00 | ロイヤルドッジ | メインアリーナ、サブアリーナ | 4 |
| 13:00〜14:00 | 昼休憩＋コスプレ大会 | 未定（仮） | 0 |
| 13:00〜13:30 | 出席確認② | 未定（仮） | 0 |
| 14:00〜15:00 | 紙飛行機飛ばし | コートB | 4 |
| 15:00〜15:30 | 学科別対抗リレー | コートA | 2 |
| 15:30〜15:40 | 出席確認③ | 未定（仮） | 0 |
| 15:40〜16:00 | 表彰式・閉会式 | 未定（仮） | 0 |

競技4件のルール全文は、stagingの `events.rule_text` と同じ内容を登録SQLに記載している。
非競技6件の備考もstagingと同じ内容を登録する。

### Roundと集合

| イベント名 | Round | 集合時刻 | 集合場所 |
| --- | ---: | --- | --- |
| 走れ！○人○脚！ | 1 | 10:20 | 体育館A |
| 走れ！○人○脚！ | 2 | 10:45 | 体育館A |
| 走れ！○人○脚！ | 3 | 11:00 | 未定（仮） |
| 走れ！○人○脚！ | 4 | 11:15 | 未定（仮） |
| ロイヤルドッジ | 1 | 11:30 | 未定（仮） |
| ロイヤルドッジ | 2 | 11:50 | 未定（仮） |
| ロイヤルドッジ | 3 | 12:10 | 未定（仮） |
| ロイヤルドッジ | 4 | 12:30 | 未定（仮） |
| 紙飛行機飛ばし | 1 | 14:00 | 未定（仮） |
| 紙飛行機飛ばし | 2 | 14:15 | 未定（仮） |
| 紙飛行機飛ばし | 3 | 14:30 | 未定（仮） |
| 紙飛行機飛ばし | 4 | 14:45 | 未定（仮） |
| 学科別対抗リレー | 1 | 15:00 | 未定（仮） |
| 学科別対抗リレー | 2 | 15:15 | 未定（仮） |

stagingでは `round_start_time` は全14件とも未設定のため、本番でも `NULL` にする。
stagingにある検証用ユーザーの参加者割当は本番へコピーしない。

開催日は **2026年11月27日（金）**。本番用 `wrangler.jsonc` の `EVENT_DATE` に
`2026-11-27` を設定する。developmentとstagingは検証用の日付を維持する。

## 既存データがある場合

- 同名イベントがない場合は新規登録する。
- 同名イベントが1件あり、時刻・ルールが一致する場合は同じIDを使用し、不足する実施場所とRoundだけ追加する。
- 同名イベントが複数ある、時刻・ルールが異なる、想定外の実施場所・Round・参加者がある場合は、変更前にSQL全体を停止する。
- 集合場所は `体育館A` と `未定（仮）` を再利用し、存在しなければ作成する。同名が複数ある場合は停止する。
- 同じSQLを再実行しても、イベント・実施場所・Roundを重複登録しない。

停止した場合は既存データを確認し、ガードを緩めて強行しない。

## 適用前の確認

1. #553の削除migrationが対象環境へ適用済みであることを確認する。
2. 対象DB、適用commit、実行日時を確認する。
3. D1 Time Travel bookmarkを取得し、環境・取得日時・適用commitとともに実施記録へ保存する。
4. 最新exportのコピーで登録SQLと確認SQLを実行し、対象外データに差分がないことを確認する。

bookmark・export・個人情報はリポジトリへ保存しない。

以下はstagingの例。本番では `--env staging` を付けず、担当者2名で対象を確認する。

```bash
npx wrangler d1 migrations list DB --remote --env staging
npx wrangler d1 time-travel info DB --env staging --json

schedule_snapshot_dir="$(mktemp -d)"
chmod 700 "$schedule_snapshot_dir"
npx wrangler d1 export DB --remote --env staging \
  --output "$schedule_snapshot_dir/before.sql"
```

exportのコピーで事前検証する。

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

## 適用

登録SQL全体を1回で実行する。手作業で文ごとに分割しない。

```bash
npx wrangler d1 execute DB --remote --env staging \
  --file operations/official-schedule-2026.sql
```

## 適用後の確認

```bash
npx wrangler d1 execute DB --remote --env staging \
  --command "$(cat operations/verify-official-schedule-2026.sql)" --json
```

- 1番目の結果が10行で、すべて `registration_status = 正常`。
- 2番目の結果が実施場所11行。
- 3番目の結果がRound 14行で、`round_start_time = NULL`、`member_count = 0`。
- 4番目の `foreign_key_check` が空。
- Event一覧・詳細・集合設定画面で、stagingと同じ名称・時刻・実施場所・ルール・集合設定を確認する。
- 登録対象外のテーブル・行・列が適用前と一致することを確認する。

実施記録は、削除migration、登録SQL、確認SQL、EVENT_DATE、UI確認をそれぞれ
「実施済み／未実施」で分ける。実際に実行した項目だけを完了扱いにする。
