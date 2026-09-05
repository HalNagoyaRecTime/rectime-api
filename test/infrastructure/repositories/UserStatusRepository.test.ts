import { env } from 'cloudflare:workers';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUserStatusRepository } from '../../../src/infrastructure/repositories/UserStatusRepository';
import type { IUserStatusRepository } from '../../../src/domain/interfaces/repositories/IUserStatusRepository';

describe('UserStatusRepository', () => {
  let repo: IUserStatusRepository;

  beforeAll(() => {
    repo = createUserStatusRepository(env.DB);
  });

  beforeEach(async () => {
    // students が class_rooms と users を参照するため、子から順に削除する
    await env.DB.prepare('DELETE FROM students').run();
    await env.DB.prepare('DELETE FROM staffs').run();
    await env.DB.prepare('DELETE FROM class_rooms').run();
    await env.DB.prepare('DELETE FROM users').run();
  });

  it('Userを無効化するとis_live_activeがfalseになる', async () => {
    await insertActiveStaff('残る管理者');
    const target = await insertUser('無効化対象');

    await expect(repo.updateLiveActive(target, false)).resolves.toEqual({
      user_id: target,
      is_live_active: false,
    });
  });

  it('無効化したUserを再有効化できる', async () => {
    await insertActiveStaff('残る管理者');
    const target = await insertUser('再有効化対象');
    await repo.updateLiveActive(target, false);

    await expect(repo.updateLiveActive(target, true)).resolves.toEqual({
      user_id: target,
      is_live_active: true,
    });
  });

  it('無効化してもStudent固有データ・所属情報は保持される', async () => {
    await insertActiveStaff('残る管理者');
    const classRoom = await env.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('KEEP', '保持確認') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const target = await insertUser('学生');
    await env.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 7, 'KEEP-001')"
    )
      .bind(target, classRoom!.class_room_id)
      .run();

    await repo.updateLiveActive(target, false);

    const student = await env.DB.prepare(
      'SELECT class_room_id, attendance_number, student_id_number FROM students WHERE user_id = ?'
    )
      .bind(target)
      .first<{
        class_room_id: number;
        attendance_number: number;
        student_id_number: string;
      }>();
    expect(student).toEqual({
      class_room_id: classRoom!.class_room_id,
      attendance_number: 7,
      student_id_number: 'KEEP-001',
    });
  });

  it('存在しないuserIdの場合はnullを返す', async () => {
    await insertActiveStaff('残る管理者');

    await expect(repo.updateLiveActive(999999, false)).resolves.toBeNull();
  });

  // 稼働中のstaffが0人になる無効化は、更新そのものが起きないことで防ぐ。
  // 事前確認を別クエリで行うと、同時に2件走ったとき双方が通過してしまう。
  describe('最後の稼働中staffの保護', () => {
    it('他に稼働中のstaffがいる場合は無効化できる', async () => {
      await insertActiveStaff('他のstaff');
      const target = await insertUser('対象');
      await insertStaff(target);

      await expect(repo.updateLiveActive(target, false)).resolves.toEqual({
        user_id: target,
        is_live_active: false,
      });
    });

    it('自分以外にstaffがいない場合は更新せずnullを返す', async () => {
      const target = await insertUser('唯一のstaff');
      await insertStaff(target);

      await expect(repo.updateLiveActive(target, false)).resolves.toBeNull();
      // 断ったうえでDBも変わっていないこと（部分的に更新されていないこと）
      await expect(readIsLiveActive(target)).resolves.toBe(1);
    });

    it('他のstaffが無効化されている場合は更新せずnullを返す', async () => {
      await insertActiveStaff('保護対象を残すためのstaff');
      const other = await insertUser('無効化されたstaff');
      await insertStaff(other);
      await repo.updateLiveActive(other, false);
      await env.DB.prepare('DELETE FROM staffs WHERE user_id != ?')
        .bind(other)
        .run();
      const target = await insertUser('対象');
      await insertStaff(target);

      await expect(repo.updateLiveActive(target, false)).resolves.toBeNull();
      await expect(readIsLiveActive(target)).resolves.toBe(1);
    });

    // deletion_status は is_live_active とは独立しており、退会しても
    // is_live_active は 1 のまま残る。この2つを混同すると、退会済みのstaffを
    // 「復旧できる人」と数えてしまう。
    it('他のstaffが退会済みの場合は更新せずnullを返す', async () => {
      const other = await insertUser('退会済みのstaff');
      await insertStaff(other);
      await markAsDeleted(other);
      const target = await insertUser('対象');
      await insertStaff(target);

      await expect(repo.updateLiveActive(target, false)).resolves.toBeNull();
      await expect(readIsLiveActive(target)).resolves.toBe(1);
    });

    it('他のstaffが削除申請中の場合は更新せずnullを返す', async () => {
      const other = await insertUser('削除申請中のstaff');
      await insertStaff(other);
      await markDeletionPending(other);
      const target = await insertUser('対象');
      await insertStaff(target);

      await expect(repo.updateLiveActive(target, false)).resolves.toBeNull();
      await expect(readIsLiveActive(target)).resolves.toBe(1);
    });

    it('有効化は他に稼働中のstaffがいなくても通る', async () => {
      const target = await insertUser('唯一のstaff');
      await insertStaff(target);
      await env.DB.prepare(
        'UPDATE users SET is_live_active = 0 WHERE user_id = ?'
      )
        .bind(target)
        .run();

      await expect(repo.updateLiveActive(target, true)).resolves.toEqual({
        user_id: target,
        is_live_active: true,
      });
    });
  });

  // 退会済みUserを有効化すると、本人はログインできないのに通知の宛先には
  // 入る状態になる。更新対象そのものの退会状態も条件に含める。
  describe('退会済みUserの更新', () => {
    it('退会済みUserは有効化できない', async () => {
      const target = await insertUser('退会済み');
      await env.DB.prepare(
        'UPDATE users SET is_live_active = 0 WHERE user_id = ?'
      )
        .bind(target)
        .run();
      await markAsDeleted(target);

      await expect(repo.updateLiveActive(target, true)).resolves.toBeNull();
      await expect(readIsLiveActive(target)).resolves.toBe(0);
    });

    it('削除申請中のUserは有効化できない', async () => {
      const target = await insertUser('削除申請中');
      await env.DB.prepare(
        'UPDATE users SET is_live_active = 0 WHERE user_id = ?'
      )
        .bind(target)
        .run();
      await markDeletionPending(target);

      await expect(repo.updateLiveActive(target, true)).resolves.toBeNull();
      await expect(readIsLiveActive(target)).resolves.toBe(0);
    });

    it('退会済みUserは無効化もできない', async () => {
      await insertActiveStaff('残る管理者');
      const target = await insertUser('退会済み');
      await markAsDeleted(target);

      await expect(repo.updateLiveActive(target, false)).resolves.toBeNull();
      await expect(readIsLiveActive(target)).resolves.toBe(1);
    });
  });

  describe('existsActiveUser', () => {
    it('退会していないUserが存在する場合はtrueを返す', async () => {
      const target = await insertUser('在籍中');

      await expect(repo.existsActiveUser(target)).resolves.toBe(true);
    });

    it('無効化されていてもUserが残っていればtrueを返す', async () => {
      await insertActiveStaff('残る管理者');
      const target = await insertUser('無効化済み');
      await repo.updateLiveActive(target, false);

      await expect(repo.existsActiveUser(target)).resolves.toBe(true);
    });

    it('退会済みUserの場合はfalseを返す', async () => {
      const target = await insertUser('退会済み');
      await markAsDeleted(target);

      await expect(repo.existsActiveUser(target)).resolves.toBe(false);
    });

    it('存在しないuserIdの場合はfalseを返す', async () => {
      await expect(repo.existsActiveUser(999999)).resolves.toBe(false);
    });
  });
});

async function insertUser(userName: string): Promise<number> {
  const user = await env.DB.prepare(
    'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
  )
    .bind(userName)
    .first<{ user_id: number }>();
  return user!.user_id;
}

async function insertStaff(userId: number): Promise<void> {
  await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
    .bind(userId)
    .run();
}

// 無効化は「他に稼働中のstaffがいること」を条件にしているため、
// 無効化そのものを確かめたいテストには、残しておく管理者が要る。
async function insertActiveStaff(userName: string): Promise<number> {
  const userId = await insertUser(userName);
  await insertStaff(userId);
  return userId;
}

async function readIsLiveActive(userId: number): Promise<number | undefined> {
  const row = await env.DB.prepare(
    'SELECT is_live_active FROM users WHERE user_id = ?'
  )
    .bind(userId)
    .first<{ is_live_active: number }>();
  return row?.is_live_active;
}

// is_live_active を触らずに deletion_status だけを進める。UserRepository の
// markAsDeleted は microsoft_account_links の削除も伴うため、ここでは
// 「退会済みだが is_live_active は 1 のまま」という状態だけを作る。
async function markAsDeleted(userId: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE users SET deletion_status = 'deleted' WHERE user_id = ?"
  )
    .bind(userId)
    .run();
}

async function markDeletionPending(userId: number): Promise<void> {
  await env.DB.prepare(
    "UPDATE users SET deletion_status = 'deletion_pending' WHERE user_id = ?"
  )
    .bind(userId)
    .run();
}
