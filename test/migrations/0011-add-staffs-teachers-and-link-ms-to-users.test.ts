import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';

// migrations/0011_add_staffs_teachers_and_link_ms_to_users.sql のうち、
// microsoft_account_links を auth_users(users_id: TEXTのUUID) から
// users(user_id: INTEGER自動採番) へ付け替えるデータ変換部分を検証するテスト。
//
// 0011 は既にDBに一度だけ適用済みで、auth_users.uid/display_name/users_id は
// 削除され、microsoft_account_links は既に新形状（users を参照）になっている。
// そのため、変換ロジック自体を再現するには「旧形状を一時的に復元→
// 0011 と同一の変換SQLを再実行→結果を検証→元に戻す」というサイクルを踏む
// （test/migrations/0010-upgrade-users.test.ts と同じ方針）。
//
// 重要: TRANSFORM_STATEMENTS は 0011 の該当箇所と同一内容を保つこと。
const TRANSFORM_STATEMENTS = [
  `ALTER TABLE users ADD COLUMN __legacy_auth_users_id TEXT`,
  `INSERT INTO users (user_name, is_live_active, __legacy_auth_users_id) SELECT display_name, 1, users_id FROM auth_users WHERE users_id IN (SELECT user_id FROM microsoft_account_links)`,
  `CREATE TABLE microsoft_account_links_new (microsoft_account_link_id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL UNIQUE, oid TEXT NOT NULL, tid TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(user_id))`,
  `INSERT INTO microsoft_account_links_new (user_id, oid, tid, created_at, updated_at) SELECT u.user_id, m.oid, m.tid, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP FROM microsoft_account_links m INNER JOIN users u ON u.__legacy_auth_users_id = m.user_id`,
  `DROP TABLE microsoft_account_links`,
  `ALTER TABLE microsoft_account_links_new RENAME TO microsoft_account_links`,
  `CREATE UNIQUE INDEX idx_microsoft_account_links_oid_tid ON microsoft_account_links(oid, tid)`,
  `CREATE INDEX idx_microsoft_account_links_user_id ON microsoft_account_links(user_id)`,
  `ALTER TABLE users DROP COLUMN __legacy_auth_users_id`,
];

async function runTransform() {
  await env.DB.batch(TRANSFORM_STATEMENTS.map(sql => env.DB.prepare(sql)));
}

async function createLegacyAuthUsers() {
  await env.DB.prepare(
    `CREATE TABLE auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_number TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`
  ).run();
}

async function restoreLegacyAuthUsersColumns() {
  await env.DB.prepare('ALTER TABLE auth_users ADD COLUMN users_id TEXT').run();
  await env.DB.prepare(
    "ALTER TABLE auth_users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''"
  ).run();
  await env.DB.prepare(
    "ALTER TABLE auth_users ADD COLUMN uid TEXT NOT NULL DEFAULT ''"
  ).run();
  // FOREIGN KEY (user_id) REFERENCES auth_users(users_id) を成立させるには
  // 参照先の列が PRIMARY KEY か UNIQUE インデックスを持つ必要がある
  await env.DB.prepare(
    'CREATE UNIQUE INDEX idx_users_users_id ON auth_users(users_id)'
  ).run();
}

async function dropLegacyAuthUsersColumns() {
  await env.DB.prepare('DROP INDEX IF EXISTS idx_users_users_id').run();
  await env.DB.prepare('ALTER TABLE auth_users DROP COLUMN uid').run();
  await env.DB.prepare('ALTER TABLE auth_users DROP COLUMN display_name').run();
  await env.DB.prepare('ALTER TABLE auth_users DROP COLUMN users_id').run();
}

async function replaceMicrosoftAccountLinksWithLegacyShape() {
  // ALTER TABLE ... RENAME はテーブルに付随するインデックス名までは
  // 引き継がない（インデックス自体はリネーム後のテーブルに追従するが、
  // 名前は元のまま）ため、同名インデックスの再作成で衝突しないよう
  // 先に削除しておく（復元時に作り直す）
  await env.DB.prepare(
    'DROP INDEX IF EXISTS idx_microsoft_account_links_oid_tid'
  ).run();
  await env.DB.prepare(
    'DROP INDEX IF EXISTS idx_microsoft_account_links_user_id'
  ).run();
  await env.DB.prepare(
    'ALTER TABLE microsoft_account_links RENAME TO microsoft_account_links_backup'
  ).run();
  await env.DB.prepare(
    `CREATE TABLE microsoft_account_links (
      microsoft_account_link_id TEXT NOT NULL PRIMARY KEY,
      user_id                   TEXT NOT NULL UNIQUE,
      oid                       TEXT NOT NULL,
      tid                       TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES auth_users(users_id)
    )`
  ).run();
}

async function restoreMicrosoftAccountLinks() {
  await env.DB.prepare('DROP TABLE IF EXISTS microsoft_account_links').run();
  await env.DB.prepare(
    'ALTER TABLE microsoft_account_links_backup RENAME TO microsoft_account_links'
  ).run();
  await env.DB.prepare(
    'CREATE UNIQUE INDEX idx_microsoft_account_links_oid_tid ON microsoft_account_links(oid, tid)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX idx_microsoft_account_links_user_id ON microsoft_account_links(user_id)'
  ).run();
}

describe('0011: microsoft_account_links を auth_users から users へ付け替えるデータ変換', () => {
  afterEach(async () => {
    await env.DB.prepare(
      "DELETE FROM users WHERE user_name LIKE '移行テスト%'"
    ).run();
    await env.DB.prepare('DROP TABLE IF EXISTS auth_users').run();
  });

  it('auth_users(旧形状)のMicrosoft連携ユーザーを users + 新形状の microsoft_account_links に正しく移行する', async () => {
    await createLegacyAuthUsers();
    await restoreLegacyAuthUsersColumns();
    await replaceMicrosoftAccountLinksWithLegacyShape();

    try {
      const now = new Date().toISOString();
      // 同じ display_name を持つ2ユーザーを用意し、表示名などの間接的な
      // 突き合わせでは無く、実際のUUID値で1対1に正確に対応付けられることを確認する
      await env.DB.batch([
        env.DB.prepare(
          'INSERT INTO auth_users (student_number, display_name, uid, users_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          'MIG011-001',
          '移行テスト同姓同名',
          'tid-a:oid-a',
          'legacy-uuid-a',
          now,
          now
        ),
        env.DB.prepare(
          'INSERT INTO auth_users (student_number, display_name, uid, users_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(
          'MIG011-002',
          '移行テスト同姓同名',
          'tid-b:oid-b',
          'legacy-uuid-b',
          now,
          now
        ),
        env.DB.prepare(
          'INSERT INTO microsoft_account_links (microsoft_account_link_id, user_id, oid, tid) VALUES (?, ?, ?, ?)'
        ).bind('link-a', 'legacy-uuid-a', 'oid-a', 'tid-a'),
        env.DB.prepare(
          'INSERT INTO microsoft_account_links (microsoft_account_link_id, user_id, oid, tid) VALUES (?, ?, ?, ?)'
        ).bind('link-b', 'legacy-uuid-b', 'oid-b', 'tid-b'),
      ]);

      await runTransform();

      const migratedUsers = await env.DB.prepare(
        "SELECT user_id, user_name FROM users WHERE user_name = '移行テスト同姓同名' ORDER BY user_id"
      ).all<{ user_id: number; user_name: string }>();
      expect(migratedUsers.results).toHaveLength(2);

      const linkA = await env.DB.prepare(
        'SELECT user_id, oid, tid FROM microsoft_account_links WHERE oid = ? AND tid = ?'
      )
        .bind('oid-a', 'tid-a')
        .first<{ user_id: number; oid: string; tid: string }>();
      const linkB = await env.DB.prepare(
        'SELECT user_id, oid, tid FROM microsoft_account_links WHERE oid = ? AND tid = ?'
      )
        .bind('oid-b', 'tid-b')
        .first<{ user_id: number; oid: string; tid: string }>();

      expect(linkA).not.toBeNull();
      expect(linkB).not.toBeNull();
      // legacy-uuid-a/b それぞれに対応する正しい users 行に紐付いていること
      // （表示名が同じでも取り違えていないこと）を、2件のuser_idが異なる
      // ことで確認する
      expect(linkA!.user_id).not.toBe(linkB!.user_id);
      expect(
        migratedUsers.results.map(u => u.user_id).sort()
      ).toEqual([linkA!.user_id, linkB!.user_id].sort());
    } finally {
      await restoreMicrosoftAccountLinks();
      await dropLegacyAuthUsersColumns();
    }
  });
});
