# rectime-api

RecTime バックエンド API（Cloudflare Workers / Hono）

---

## 必要環境

- Node.js v22（[nvm](https://github.com/nvm-sh/nvm) 推奨）
- Cloudflare アカウント（本番デプロイ時）
- Microsoft Entra ID（Azure AD）アプリ登録

---

## ローカル開発セットアップ

### 1. Node.js バージョン設定

```bash
nvm use
```

### 2. 依存関係インストール

```bash
npm install
```

### 3. Azure AD アプリ登録

[Azure ポータル](https://portal.azure.com) → Microsoft Entra ID → アプリの登録 で新規登録し、以下を設定する。

#### リダイレクト URI

| プラットフォーム | URI |
|---|---|
| Web | `http://localhost:8787/api/v1/auth/microsoft/callback` |
| モバイル/デスクトップ | `com.rectime.mobile://auth/callback` |

#### API のアクセス許可

Microsoft Graph の以下を委任アクセス許可として追加:

- `openid`
- `profile`
- `email`
- `offline_access`
- `User.Read`

### 4. 証明書の生成とアップロード

証明書がない場合は生成する:

```bash
openssl req -x509 -newkey rsa:2048 \
  -keyout rectime-private.pem \
  -out rectime-cert.pem \
  -days 730 -nodes \
  -subj "/CN=rectime-api"
```

`rectime-cert.pem` を Azure ポータル → アプリ登録 → 証明書とシークレット → 証明書 にアップロードする。

サムプリント（Base64URL 形式）を取得:

```bash
python3 - <<'EOF'
import subprocess, base64

result = subprocess.run(
    ["openssl", "x509", "-in", "rectime-cert.pem", "-fingerprint", "-sha1", "-noout"],
    capture_output=True, text=True
)
hex_thumb = result.stdout.strip().replace("sha1 Fingerprint=", "").replace(":", "")
raw = bytes.fromhex(hex_thumb)
b64 = base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
print("MICROSOFT_CERT_THUMBPRINT=" + b64)
EOF
```

### 5. 環境変数の設定

```bash
cp .dev.vars.example .dev.vars
```

`.dev.vars` を編集して以下を設定する:

| 変数 | 説明 |
|---|---|
| `MICROSOFT_CLIENT_ID` | Azure AD アプリ登録のクライアント ID |
| `MICROSOFT_CLIENT_PRIVATE_KEY` | `rectime-private.pem` の内容（`"..."` で囲む） |
| `MICROSOFT_CERT_THUMBPRINT` | 手順 4 で取得した Base64URL サムプリント |
| `MICROSOFT_TENANT` | `organizations`（組織アカウント全般）または特定テナント ID |
| `ALLOWED_MICROSOFT_TENANTS` | 受け付けるテナント ID（カンマ区切り複数可） |
| `MICROSOFT_REDIRECT_URI` | `http://localhost:8787/api/v1/auth/microsoft/callback` |
| `MICROSOFT_MOBILE_REDIRECT_URI` | `com.rectime.mobile://auth/callback` |
| `FRONTEND_URL` | `http://localhost:5173` |
| `ALLOWED_ORIGINS` | CORS で許可するフロントエンドの origin（カンマ区切り複数可） |
| `EVENT_DATE` | 通知配信を許可する開催日（JST、`YYYY-MM-DD`）。未設定・不正な値の場合は配信しない |
| `JWT_SECRET` | 32 文字以上のランダム文字列 |

`MICROSOFT_CLIENT_PRIVATE_KEY` の設定例:

```
MICROSOFT_CLIENT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----
MIIEvQIBADA...（秘密鍵の内容）
-----END PRIVATE KEY-----"
```

### 6. ローカル D1 データベースのマイグレーション

```bash
npm run "db:migrate --local"
```

### 7. 起動

```bash
npm run dev
```

`http://localhost:8787` で API が起動する。

---

## 本番デプロイ

```bash
# D1 マイグレーション（本番）
npm run "db:migrate --remote"

# デプロイ
npm run deploy
```

本番環境のシークレットは Cloudflare ダッシュボード または `wrangler secret put <KEY>` で設定する。

### CORS 設定

`ALLOWED_ORIGINS` には API の URL ではなく、API を呼び出すフロントエンドの origin を設定する。

例:

```text
ALLOWED_ORIGINS=https://recwatch.pages.dev,https://*.recwatch.pages.dev
```

`https://recwatch.pages.dev` は Cloudflare Pages の本番 URL 用、`https://*.recwatch.pages.dev` は branch/preview URL 用の設定。

フロントエンド側の `VITE_BACKEND_BASE_URL` には、バックエンド API の URL を設定する。

例:

```text
VITE_BACKEND_BASE_URL=https://rectime-api.rectime-project.workers.dev
```

---

## 主要 API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/` | ヘルスチェック |
| GET | `/api/v1/auth/microsoft/login` | MS ログイン開始 |
| GET | `/api/v1/auth/microsoft/callback` | MS OAuth コールバック |
| GET | `/api/v1/auth/me` | 認証ユーザー情報取得 |
| GET | `/api/v1/auth/me/photo` | プロフィール写真取得 |
| POST | `/api/v1/auth/logout` | ログアウト |
| POST | `/api/v1/auth/refresh` | セッション更新 |
