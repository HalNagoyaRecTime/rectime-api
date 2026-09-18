# Issue #423 初期seed削除Runbook

## 1. 目的

`0033_cleanup_initial_seed_data.sql`を安全に適用し、初期migration由来の
サンプルデータを削除する。変更済みまたは実運用データに関連付いた候補は保持し、
環境ごとに除外理由を記録する。

一般的な環境一覧、Smoke Test、Rollback、D1 Time Travel restoreは
[iOSリリース向けBackend監視・障害対応Runbook](./ios-release-backend-runbook.md)
を参照する。このRunbookではIssue #423固有の監査と適用順だけを扱う。

## 2. 重要な原則

- `docs/operations/sql/issue-423-seed-audit.sql`は`SELECT`と`PRAGMA`だけで構成し、
  データを変更しない。
- 監査結果が`KEEP`の候補は強制削除しない。正規利用の確認または別Issueでの移行方針を記録する。
- rawの氏名、学籍番号、OID、メールアドレス、FCM Token、export内容をIssue、PR、チャットへ貼らない。
- productionのMigrationとTime Travel restoreは、担当者2名以上で対象と時刻を確認する。
- productionへローカル端末から直接Migrationを適用せず、Deploy Workflowを使用する。
- D1のSQL監査では`AUTH_KV`やQueueの状態を確認できない。監査結果を外部状態の不存在証明には使わない。

## 3. 適用タイミング

| 段階 | `0033`の適用契機 | 適用前に必要なこと |
| --- | --- | --- |
| local | 隔離したlocal D1へ手動適用 | 全migrationと専用テストの確認 |
| development | develop push、同一RepositoryのPR作成・更新後にCI成功 | **PR作成前または既存PRへのpush前**に監査、bookmark、必要ならexport |
| staging | mainへのpush | main反映前に監査、bookmark、必要ならexport |
| production | mainでDeploy Workflowを手動実行 | staging確認後、実行直前に再監査、bookmark、必要ならexport、2名確認 |

PR previewとdevelopmentは同じ`rectime-api-dev`を共有する。別PRによって先に
`0033`が適用される可能性があるため、各段階でmigration一覧を再確認する。

## 4. merge・push前の確認

1. 対象Commit SHAと確認者を記録する。
2. `0033_cleanup_initial_seed_data.sql`より後に、対象4テーブルへの新しい外部キーや派生データが追加されていないことを確認する。
3. PR #413が先にmergeされた場合、または`teams`／`team_scores`が導入済みの場合は適用を止める。seed教室から派生したteamの扱いをmigrationと監査SQLへ追加してから再確認する。
4. 以下が成功していることを確認する。

```shell
npm run lint
npm run type-check
npm test
```

## 5. 読取専用監査

`--file`はremote D1でSQLファイルの投入経路を使用し、SELECT結果ではなく
実行概要だけを返す。監査SQLは`--command=`で渡し、候補16行と確認4行が
すべて返ったことを`jq`で検証する。

以下の関数を、監査コマンドを実行するshellで先に定義する。

```shell
issue_423_audit() (
  set -o pipefail

  npx wrangler d1 execute "$@" \
    --command="$(cat docs/operations/sql/issue-423-seed-audit.sql)" \
    --json |
    jq -e '
      if length == 1
        and .[0].success == true
        and (.[0].results | length == 20)
        and all(.[0].results[];
          has("entity_type")
          and has("seed_id")
          and has("expected_action")
          and has("reason_codes"))
        and (([
          .[0].results[] | select(.entity_type == "check") | .seed_id
        ] | sort) == [-4, -3, -2, -1])
        and (([
          .[0].results[] | select(.entity_type == "class_room") | .seed_id
        ] | sort) == [1, 2, 3])
        and (([
          .[0].results[] | select(.entity_type == "event") | .seed_id
        ] | sort) == [1, 2, 3, 4])
        and (([
          .[0].results[] | select(.entity_type == "student") | .seed_id
        ] | sort) == [1, 2, 3, 4])
        and (([
          .[0].results[] | select(.entity_type == "user") | .seed_id
        ] | sort) == [1, 2, 3, 4, 5])
      then .[0].results
      else error("監査結果が期待した20行ではありません")
      end
    '
)
```

### 5.1 local

既存local D1を確認する場合は、Migrationを適用する前に実行する。

```shell
issue_423_audit rectime-api-dev --local --env development
```

空DBからの最終状態は、隔離した保存先で確認する。

```shell
ISSUE_423_LOCAL_DIR="$(mktemp -d)"
chmod 700 "${ISSUE_423_LOCAL_DIR}"

npx wrangler d1 migrations apply rectime-api-dev \
  --local --env development \
  --persist-to "${ISSUE_423_LOCAL_DIR}"

issue_423_audit rectime-api-dev \
  --local --env development \
  --persist-to "${ISSUE_423_LOCAL_DIR}"
```

### 5.2 remote環境

```shell
# development
issue_423_audit rectime-api-dev --remote --env development

# staging
issue_423_audit rectime-api-staging --remote --env staging

# production
issue_423_audit rectime-api --remote
```

### 5.3 判定

監査SQLは、event 4件、student 4件、user 5件、class_room 3件の候補16行と、
system user・外部キー・未対応schema・0033適用状態の確認4行を、単一の結果セットとして返す。氏名や学籍番号
などの実値は返さず、種別、seed ID、判定、理由コードだけを返す。

- `ABSENT`: 既に存在しない。
- `DELETE`: 現在の状態なら`0033`が削除する見込み。
- `KEEP`: 値の変更または関連付けがあり、`0033`が保持する見込み。

`KEEP`の理由が想定どおりか、権限のあるD1画面内で確認する。実値は実施記録へ
転記せず、`正規利用を確認`、`別Issueで移行予定`などの判断だけを残す。

## 6. bookmarkとexport

### 6.1 migration一覧

```shell
npx wrangler d1 migrations list rectime-api-dev --remote --env development
npx wrangler d1 migrations list rectime-api-staging --remote --env staging
npx wrangler d1 migrations list rectime-api --remote
```

### 6.2 Time Travel bookmark

各remote環境への適用直前に取得し、実施記録へ残す。

```shell
npx wrangler d1 time-travel info rectime-api-dev --env development --json
npx wrangler d1 time-travel info rectime-api-staging --env staging --json
npx wrangler d1 time-travel info rectime-api --json
```

### 6.3 export

Time Travel bookmarkは必須とする。exportは、チームが承認した暗号化保管先、
保管責任者、削除期限がすべて決まっている場合だけ取得する。これらが未定のまま、
個人端末へ便宜的なコピーを作らない。

```shell
umask 077
: "${ISSUE_423_BACKUP_BASE:?承認済みの暗号化保管先を設定してください}"
ISSUE_423_BACKUP_DIR="$(
  mktemp -d "${ISSUE_423_BACKUP_BASE%/}/issue-423.XXXXXX"
)"
chmod 700 "${ISSUE_423_BACKUP_DIR}"

# 対象環境のコマンドだけを実行する。
npx wrangler d1 export rectime-api-dev \
  --remote --env development \
  --output "${ISSUE_423_BACKUP_DIR}/development-before-0033.sql"

npx wrangler d1 export rectime-api-staging \
  --remote --env staging \
  --output "${ISSUE_423_BACKUP_DIR}/staging-before-0033.sql"

npx wrangler d1 export rectime-api \
  --remote \
  --output "${ISSUE_423_BACKUP_DIR}/production-before-0033.sql"
```

exportには実データと個人情報が含まれる。

- Git管理しない。
- Issue、PR、チャットへ添付しない。
- SQL本文や保存先を実施記録へ書かない。
- 記録するのは取得成否、取得日時、SHA-256、保管責任者、削除期限だけにする。
- export全体をproductionへ`d1 execute --file`で流し戻さない。
- productionの適用確認とチーム合意済みの観察期間が完了したら、承認済みの手順で削除し、削除完了を記録する。

## 7. 段階適用

### 7.1 development

1. PRを作成する前、または既存PRへpushする前に、developmentの監査、bookmark、必要なexportを完了する。
2. PRを作成・更新し、CIとDeploy WorkflowのMigration jobを確認する。
3. `0033`の適用後に監査SQLを再実行する。
4. `/health`と代表APIのSmoke Testを実施する。
5. 監査結果と実施記録をレビューしてから次へ進む。

### 7.2 staging

1. main反映前に、stagingの監査、bookmark、必要なexportを完了する。
2. mainへのpushで実行されるMigration jobを確認する。
3. 適用後の監査とSmoke Testを実施する。
4. 少なくとも別の1名が結果を確認してからproductionへ進む。

### 7.3 production

1. stagingの確認結果と対象Commit SHAを2名で照合する。
2. productionの監査、bookmark、必要なexportを実行直前に取得する。
3. mainのDeploy Workflowを手動実行する。
4. Migration jobの完了後、監査SQLとSmoke Testを実施する。
5. Workers Logs／Metricsで新しいエラーがないことを確認する。

## 8. 適用前後の比較

| 適用前 | 適用後 | 判断 |
| --- | --- | --- |
| `DELETE` | `ABSENT` | 正常 |
| `KEEP` | `KEEP` | 正常。理由と保持判断を記録する |
| `ABSENT` | `ABSENT` | 正常 |
| `DELETE` | `DELETE` | migration未適用、失敗、または想定外。昇格を止める |
| `KEEP` | `ABSENT` | 想定外の削除。昇格を止め、即時調査する |
| 任意 | 理由不明の`KEEP` | 強制削除せず、個別判断まで昇格を止める |

監査後からMigration適用までの間に関連データが追加された場合、Migration自身が
適用時に再判定して`KEEP`側へ倒す。適用後の監査結果を正として理由を再分類する。

`system_user`、`foreign_key_check`、`unsupported_team_schema`のチェック行は、
すべて`OK`でなければならない。`migration_0033`は適用前が`PENDING`、適用後が
`APPLIED`であることを確認する。適用前から`APPLIED`の場合は、共有環境へ別の
PRから先に適用された可能性があるため、適用後の手順として監査結果を確認する。

## 9. 異常時

- 途中失敗時は同じMigrationを手動SQLで補完しない。Migration一覧と監査結果を確認する。
- `0033`の各DELETEは再実行可能だが、原因とD1の適用状態を確認してから再実行を判断する。
- 復旧判断前に、障害発生後の現在bookmarkと必要なexportも取得する。
- Time Travel restoreはMigrationだけでなく、それ以降の正常な書き込みも含めてDB全体を巻き戻す。
- productionのrestoreは既存Runbookどおり2名以上で確認し、個別行の通常復旧には使用しない。

## 10. 実施記録

```text
実施日時(JST):
実施者:
確認者:
環境:
Commit SHA:
D1:
適用前bookmark:
export取得成否:
export SHA-256:
export保管責任者:
export削除期限:
export削除完了:
0033適用状態:
適用前 DELETE / KEEP / ABSENT 件数:
適用後 DELETE / KEEP / ABSENT 件数:
保持したentity_type / seed_id / reason_codes / 判断:
system_user確認:
foreign_key_check:
unsupported_team_schema確認:
Health Check:
代表API Smoke Test:
Workers Logs／Metrics:
残課題:
```

## 11. 参考資料

- [Cloudflare D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/)
- [Cloudflare D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)
- [Cloudflare D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
