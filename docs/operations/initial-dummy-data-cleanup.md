# 初期ダミーデータの削除

## 対象

`0047_remove_initial_dummy_data.sql` で初期seedの生徒4件、ユーザー5件、クラス3件、チーム3件、イベント4件、実施場所4件を削除する。正式スケジュール・仮Roundの登録や `EVENT_DATE` の変更は行わない。

初期IDに加え、学生は氏名・学籍番号・クラス・出席番号、イベントは名称・ルール文・時刻・実施場所を照合する。変更済みの行を名前だけで削除しない。山田健太は初期 `user_id = 5` と氏名を照合する。`user_id = -1` のシステム移行ユーザーと、実施場所とは別の `gathering_spots` は保持する。

正規生徒とのクラス共有、他クラスとのチーム共有、得点、正式イベントとの実施場所共有、Microsoft連携、職員・教員ロール、Firebase Token、対象外の集合参加、通知参照があれば、`dummy_data_has_no_unreviewed_relations` 制約で削除前に停止する。通知対象の `target_id` と自動通知の `source_id` も確認する。対象イベントの集合は対象ユーザーだけが参加している場合に限り、参加情報とともに削除する。

## 適用前

現行の `.github/workflows/deploy.yml` は、developへのpush後にCIが成功すると **developmentとstagingの両方** に未適用migrationを自動適用する。PRのマージ前に両環境の対象IDと関連データを確認し、復元情報を控える。PRブランチから共有D1へ先行適用しない。

以下はstaging用。developmentを確認する場合は `--env development` を明示する。本番はIssue #552で扱う。

```bash
npx wrangler d1 migrations list DB --remote --env staging
npx wrangler d1 time-travel info DB --env staging --json
```

bookmark、取得時刻、環境、適用予定のcommitを実施記録へ控える。実データを含む出力やbookmarkはソースコードに書き込まない。

削除候補と残すデータの確認には、次の読み取りSQLを使う。各件数が異なる場合は、すでに削除されたのか、内容が更新されたのかを確認する。件数を合わせるために条件を緩めない。

```sql
SELECT s.student_id, u.user_id, u.user_name, s.student_id_number,
       c.class_code, c.class_name, s.attendance_number
FROM students s
JOIN users u ON u.user_id = s.user_id
LEFT JOIN class_rooms c ON c.class_room_id = s.class_room_id
WHERE s.student_id_number IN ('10000', '10001', '10002', '10003');

SELECT user_id, user_name, is_live_active, deletion_status
FROM users WHERE user_id IN (-1, 1, 2, 3, 4, 5);

SELECT class_room_id, class_code, class_name, teacher_id, team_id
FROM class_rooms WHERE class_code IN ('11A', '11B', '12A');

SELECT t.team_id, t.team_name, ts.scores
FROM teams t LEFT JOIN team_scores ts ON ts.team_id = t.team_id
WHERE t.team_id IN (1, 2, 3);

SELECT e.event_id, e.event_name, e.rule_text, e.start_time, e.end_time,
       v.venue_id, v.venue_name
FROM events e
LEFT JOIN event_venues ev ON ev.event_id = e.event_id
LEFT JOIN venues v ON v.venue_id = ev.venue_id
WHERE e.event_id IN (1, 2, 3, 4);

SELECT venue_id, venue_name FROM venues
WHERE venue_name IN ('体育館', '第1教室', '講堂', 'PC教室');

PRAGMA foreign_key_check;
```

上の一覧と `foreign_key_check` だけでは、正規データとの共有や通知参照は検出できない。**マージ前に両環境のD1を非公開の一時ディレクトリへexportし、そのコピーでmigrationを事前実行する。** これにより、本適用と同じガードでMicrosoft連携・ロール・Token・集合参加・通知の関連を確認する。

リポジトリ直下で、まずexportが成功したことを確認する。

```bash
cleanup_snapshot_dir="$(mktemp -d)"
npx wrangler d1 export rectime-api-staging --remote --env staging \
  --output "$cleanup_snapshot_dir/staging-before.sql"
```

exportに成功したら、コピーに対してだけ事前適用する。macOS標準のSQLiteを使用する。

```bash
/usr/bin/sqlite3 -bail "$cleanup_snapshot_dir/staging-check.sqlite" \
  < "$cleanup_snapshot_dir/staging-before.sql"

/usr/bin/sqlite3 "$cleanup_snapshot_dir/staging-check.sqlite" <<'SQL'
.bail on
PRAGMA foreign_keys = ON;
BEGIN;
.read migrations/0047_remove_initial_dummy_data.sql
COMMIT;
PRAGMA foreign_key_check;
SQL
```

事前適用が成功し、対象外データの保持と削除件数が正しいことをexportと比較する。ガードで停止した場合は、実環境のMicrosoft連携・ロール・Token・集合参加・通知参照などを読み取りで調べ、保持方法を決めるまでマージしない。developmentも専用exportで同じ確認を行う。確認中にデータが変更された場合は、最新のexportで再確認する。

リポジトリやIssueに個人情報を含むexportを添付しない。

### 削除対象を正規データが参照している場合

対象外の生徒・イベント自体は削除せず、削除するクラス・実施場所への参照の付け替え先を確定する。生徒を未所属にする場合は、`class_room_id` と `attendance_number` を両方 `NULL` にする。イベントは既存の実施場所へ付け替え、イベントと関連行のIDやその他の列を保持する。

付け替えは、最新exportで確認した行と列に限定する。付け替え先の実施場所が1件だけ存在すること、同じイベントとの関連が重複しないこと、確認した行が変更されていないことを検査する。環境固有のIDや実データを含む操作用SQLは非公開の作業ディレクトリに保存し、リポジトリには含めない。

参照の付け替え、変更していない0047のSQL、`d1_migrations` への適用記録を同じ原子的な操作で実行する。事前コピーで一括実行と失敗時の全体ロールバックを確認し、適用後は許可した付け替え・ダミーデータ削除・適用記録以外の変更がないことを全テーブルで比較する。

## 適用後

デプロイ結果と `d1 migrations list` で0047の適用を確認し、適用前SQLを再実行する。次を確認する。

- 初期ダミーデータだけが削除され、システム移行ユーザーが残っている。
- 正規データとその関連・通知履歴が、確定した参照の付け替えを除いて適用前と一致している。
- `PRAGMA foreign_key_check` が空で、削除したIDを指す通知対象・自動通知が残っていない。
- `__migration_0047_` で始まる作業テーブルが残っていない。

ガードで停止した場合は同一migration内の変更はロールバックされる。SQL条件を緩めず、対象IDと関連データを再確認する。

Issue #553の実施記録には、環境、適用commit、適用日時、削除件数、保持確認、事前に取得したbookmarkを記載する。実環境への適用と確認が終わるまではIssueの完了条件をチェックしない。

復元が必要な場合は、控えたbookmarkと適用後の書き込みへの影響を確認し、担当者と復元範囲を決めてからD1 Time Travelを実行する。
