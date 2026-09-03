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
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('無効化対象') RETURNING user_id"
    ).first<{ user_id: number }>();

    await expect(repo.updateLiveActive(user!.user_id, false)).resolves.toEqual({
      user_id: user!.user_id,
      is_live_active: false,
    });
  });

  it('無効化したUserを再有効化できる', async () => {
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('再有効化対象') RETURNING user_id"
    ).first<{ user_id: number }>();
    await repo.updateLiveActive(user!.user_id, false);

    await expect(repo.updateLiveActive(user!.user_id, true)).resolves.toEqual({
      user_id: user!.user_id,
      is_live_active: true,
    });
  });

  it('無効化してもStudent固有データ・所属情報は保持される', async () => {
    const classRoom = await env.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('KEEP', '保持確認') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await env.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('学生') RETURNING user_id"
    ).first<{ user_id: number }>();
    await env.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 7, 'KEEP-001')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
      .run();

    await repo.updateLiveActive(user!.user_id, false);

    const student = await env.DB.prepare(
      'SELECT class_room_id, attendance_number, student_id_number FROM students WHERE user_id = ?'
    )
      .bind(user!.user_id)
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
    await expect(repo.updateLiveActive(999999, false)).resolves.toBeNull();
  });

  describe('hasOtherActiveStaff', () => {
    it('他に有効なstaffがいる場合はtrueを返す', async () => {
      const target = await insertUser('対象');
      const other = await insertUser('他のstaff');
      await insertStaff(other);

      await expect(repo.hasOtherActiveStaff(target)).resolves.toBe(true);
    });

    it('自分以外にstaffがいない場合はfalseを返す', async () => {
      const target = await insertUser('唯一のstaff');
      await insertStaff(target);

      await expect(repo.hasOtherActiveStaff(target)).resolves.toBe(false);
    });

    it('他のstaffが無効化されている場合はfalseを返す', async () => {
      const target = await insertUser('対象');
      const other = await insertUser('無効化されたstaff');
      await insertStaff(other);
      await repo.updateLiveActive(other, false);

      await expect(repo.hasOtherActiveStaff(target)).resolves.toBe(false);
    });

    // deletion_status は is_live_active とは独立しており、退会しても
    // is_live_active は 1 のまま残る。この2つを混同すると、退会済みのstaffを
    // 「復旧できる人」と数えてしまう。
    it('他のstaffが退会済みの場合はfalseを返す', async () => {
      const target = await insertUser('対象');
      const other = await insertUser('退会済みのstaff');
      await insertStaff(other);
      await markAsDeleted(other);

      await expect(repo.hasOtherActiveStaff(target)).resolves.toBe(false);
    });

    it('他のstaffが削除申請中の場合はfalseを返す', async () => {
      const target = await insertUser('対象');
      const other = await insertUser('削除申請中のstaff');
      await insertStaff(other);
      await markDeletionPending(other);

      await expect(repo.hasOtherActiveStaff(target)).resolves.toBe(false);
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
