import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import { insertClassRoomWithTeam } from '../../fixtures/classRooms';

let sequence = 0;

describe('FirebaseTokenRepository', () => {
  let repository: IFirebaseTokenRepository;
  let classRoomId: number;
  let userIds: number[];

  async function createUser(userName: string): Promise<number> {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(userName)
      .first<{ user_id: number }>();
    userIds.push(user!.user_id);
    return user!.user_id;
  }

  beforeEach(async () => {
    sequence += 1;
    userIds = [];
    await env.DB.prepare('DELETE FROM firebase_tokens').run();
    const classRoom = await insertClassRoomWithTeam(env.DB, {
      classCode: `FIREBASE-TEST-${sequence}`,
      className: 'Firebaseトークンテスト用学級',
    });
    classRoomId = classRoom.classRoomId;
    repository = createFirebaseTokenRepository(env.DB);
  });

  afterEach(async () => {
    await env.DB.prepare('DELETE FROM firebase_tokens').run();
    for (const userId of userIds) {
      await env.DB.prepare('DELETE FROM students WHERE user_id = ?')
        .bind(userId)
        .run();
      await env.DB.prepare('DELETE FROM staffs WHERE user_id = ?')
        .bind(userId)
        .run();
      await env.DB.prepare('DELETE FROM teachers WHERE user_id = ?')
        .bind(userId)
        .run();
      await env.DB.prepare('DELETE FROM users WHERE user_id = ?')
        .bind(userId)
        .run();
    }
    await env.DB.prepare('DELETE FROM class_rooms WHERE class_room_id = ?')
      .bind(classRoomId)
      .run();
  });

  it.each(['student', 'staff', 'teacher'] as const)(
    '%sのusers.user_idへTokenを登録できる',
    async userType => {
      const userId = await createUser(`Firebaseテスト-${userType}`);
      if (userType === 'student') {
        await env.DB.prepare(
          `INSERT INTO students (
             user_id, class_room_id, attendance_number, student_id_number
           ) VALUES (?, ?, 1, ?)`
        )
          .bind(userId, classRoomId, `FIREBASE-${sequence}`)
          .run();
      } else if (userType === 'staff') {
        await env.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
          .bind(userId)
          .run();
      } else {
        await env.DB.prepare('INSERT INTO teachers (user_id) VALUES (?)')
          .bind(userId)
          .run();
      }

      await expect(
        repository.register({
          userId,
          platform: 'android',
          fcmToken: `token-${userType}`,
        })
      ).resolves.toMatchObject({
        user_id: userId,
        platform: 'android',
        is_firebase_active: true,
      });
    }
  );

  it('同じ利用者のToken更新時に既存行を最新Tokenへ更新する', async () => {
    const userId = await createUser('Firebaseトークン更新利用者');
    const first = await repository.register({
      userId,
      platform: 'android',
      fcmToken: 'token-before',
    });
    const second = await repository.register({
      userId,
      platform: 'android',
      fcmToken: 'token-after',
    });

    expect(second.firebase_token_id).toBe(first.firebase_token_id);
    const stored = await env.DB.prepare(
      'SELECT fcm_token FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(userId)
      .first<{ fcm_token: string }>();
    expect(stored?.fcm_token).toBe('token-after');
  });

  it('無効化済みTokenの再登録時に有効化する', async () => {
    const userId = await createUser('Firebaseトークン再登録利用者');
    const registered = await repository.register({
      userId,
      platform: 'android',
      fcmToken: 'token-reactivate',
    });
    await repository.deactivate(registered.firebase_token_id);

    const reactivated = await repository.register({
      userId,
      platform: 'android',
      fcmToken: 'token-reactivate',
    });

    expect(reactivated.is_firebase_active).toBe(true);
    await expect(repository.findActiveTokens()).resolves.toHaveLength(1);
  });

  it('別利用者に登録済みのTokenを上書きしない', async () => {
    const firstUserId = await createUser('Firebase Token所有者');
    const secondUserId = await createUser('Firebase Token別利用者');
    await repository.register({
      userId: firstUserId,
      platform: 'android',
      fcmToken: 'token-owned',
    });

    await expect(
      repository.register({
        userId: secondUserId,
        platform: 'android',
        fcmToken: 'token-owned',
      })
    ).rejects.toThrow();

    const owner = await env.DB.prepare(
      'SELECT user_id FROM firebase_tokens WHERE fcm_token = ?'
    )
      .bind('token-owned')
      .first<{ user_id: number }>();
    expect(owner?.user_id).toBe(firstUserId);
  });

  it('同一利用者から並行登録されてもToken行を重複させない', async () => {
    const userId = await createUser('Firebase Token並行登録利用者');

    await Promise.all([
      repository.register({
        userId,
        platform: 'android',
        fcmToken: 'token-concurrent',
      }),
      repository.register({
        userId,
        platform: 'android',
        fcmToken: 'token-concurrent',
      }),
    ]);

    const count = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(userId)
      .first<{ count: number }>();
    expect(count?.count).toBe(1);
  });

  it('存在しないusers.user_idでは登録しない', async () => {
    await expect(
      repository.register({
        userId: 999999,
        platform: 'android',
        fcmToken: 'token-unknown-user',
      })
    ).rejects.toThrow('User not found');
  });

  it('有効なTokenのみをfirebase_token_id昇順で返す', async () => {
    const firstUserId = await createUser('Firebase有効利用者');
    const secondUserId = await createUser('Firebase無効利用者');
    await repository.register({
      userId: firstUserId,
      platform: 'android',
      fcmToken: 'token-active',
    });
    const inactive = await repository.register({
      userId: secondUserId,
      platform: 'android',
      fcmToken: 'token-inactive',
    });
    await repository.deactivate(inactive.firebase_token_id);

    const tokens = await repository.findActiveTokens();

    expect(tokens).toHaveLength(1);
    expect(tokens[0].fcm_token).toBe('token-active');
  });
});
