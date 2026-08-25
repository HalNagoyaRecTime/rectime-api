# AGENTS.md — rectime-api

## 基本ルール

- シークレット、資格情報、個人情報、実環境の値をリポジトリにコミット・プッシュしない。
- `migrations/`配下のファイルは変更・削除しない。
- PR作成時は`.github/PULL_REQUEST_TEMPLATE.md`に沿って記載する。

## ブランチ

- 通常は`develop`から作業ブランチを作り、`develop`へPRを出す。
- stacked PRでは、依存元の作業ブランチをPR先にする。
- `main`と`develop`へ直接pushしない。
- ブランチ名には、変更内容が分かる`type`（`feature`、`fix`、`refactor`、`docs`、`chore`、`release`など）を付ける。
- IssueまたはPRの番号を含める場合は、数字だけにせず`issue-xx`または`pr-xx`と明記する。

例:

- `feature/issue-123-add-notification-filter`
- `docs/pr-217-recwatch-agents-architecture`

## コミット

- 勝手にコミットしない。
- コミットメッセージは日本語で簡潔に書く。

## ドキュメント

| 文書 | 確認内容 |
| --- | --- |
| `README.md` | リポジトリの目的と責任範囲 |
| `AGENTS.md` | 作業ルールと検証方法 |
| `ARCHITECTURE.md` | 配置、責務、依存方向、実装方法 |

## 検証

作業終了時に以下のコマンドが通ることを確認する。

- `npm run format:check`
- `npm run lint`
- `npm run type-check`
- `npm test`
