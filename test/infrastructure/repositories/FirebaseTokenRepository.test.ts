import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

let sequence = 0;

describe('FirebaseTokenRepository', () => {
  let repo: IFirebaseTokenRepository;
  let classRoomId: number;
  let userIds: number[];
  let studentNumbers: { first: string; second: string };

  async function createStudent(studentNumber: string, userName: string) {
    const user = await env.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(userName)
      .first<{ user_id: number }>();
    userIds.push(user!.user_id);
    await env.DB.prepare(
      'INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, ?, ?)'
    )
      .bind(user!.user_id, classRoomId, userIds.length, studentNumber)
      .run();
    return user!.user_id;
  }

  beforeEach(async () => {
    sequence += 1;
    userIds = [];
    studentNumbers = {
      first: `FIREBASE-TEST-${sequence}-1`,
      second: `FIREBASE-TEST-${sequence}-2`,
    };
    await env.DB.prepare('DELETE FROM firebase_tokens').run();
    const classRoom = await env.DB.prepare(
      'INSERT INTO class_rooms (class_code, class_name) VALUES (?, ?) RETURNING class_room_id'
    )
      .bind(`FIREBASE-TEST-${sequence}`, 'Firebaseトークンテスト用学級')
      .first<{ class_room_id: number }>();
    classRoomId = classRoom!.class_room_id;
    await createStudent(studentNumbers.first, 'Firebaseテスト生徒1');
    await createStudent(studentNumbers.second, 'Firebaseテスト生徒2');
    repo = createFirebaseTokenRepository(env.DB);
  });

  afterEach(async () => {
    await env.DB.prepare('DELETE FROM firebase_tokens').run();
    for (const userId of userIds) {
      await env.DB.prepare('DELETE FROM students WHERE user_id = ?')
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

  describe('register', () => {
    it('登録済み学生の users と firebase_tokens を紐付ける', async () => {
      const result = await repo.register({
        studentNumber: studentNumbers.first,
        platform: 2,
        fcmToken: 'token-a',
      });

      expect(result.user).toMatchObject({
        user_name: 'Firebaseテスト生徒1',
        is_live_active: 1,
      });
      expect(result.firebaseToken).toMatchObject({
        user_id: result.user.user_id,
        platform: 2,
        fcm_token: 'token-a',
        is_firebase_active: 1,
      });
    });

    it('存在しない学生番号では Student not found を返す', async () => {
      await expect(
        repo.register({
          studentNumber: `FIREBASE-UNKNOWN-${sequence}`,
          platform: 2,
          fcmToken: 'token-a',
        })
      ).rejects.toThrow('Student not found');
    });

    it('同じ fcm_token で再登録するとFirebaseトークンを更新する', async () => {
      const first = await repo.register({
        studentNumber: studentNumbers.first,
        platform: 2,
        fcmToken: 'token-a',
      });
      const second = await repo.register({
        studentNumber: studentNumbers.second,
        platform: 1,
        fcmToken: 'token-a',
      });

      expect(second.firebaseToken.firebase_token_id).toBe(
        first.firebaseToken.firebase_token_id
      );
      expect(second.firebaseToken.platform).toBe(1);
      expect(second.firebaseToken.user_id).toBe(second.user.user_id);
      await expect(repo.findActiveTokens()).resolves.toHaveLength(1);
    });
  });

  describe('findActiveTokens', () => {
    it('is_firebase_active = 1 のトークンのみをfirebase_token_id昇順で返す', async () => {
      await repo.register({
        studentNumber: studentNumbers.first,
        platform: 2,
        fcmToken: 'token-a',
      });
      const second = await repo.register({
        studentNumber: studentNumbers.second,
        platform: 1,
        fcmToken: 'token-b',
      });
      await repo.deactivate(second.firebaseToken.firebase_token_id);

      const tokens = await repo.findActiveTokens();

      expect(tokens).toHaveLength(1);
      expect(tokens[0].fcm_token).toBe('token-a');
    });
  });

  describe('deactivate', () => {
    it('指定したfirebase_token_idのトークンを無効化する', async () => {
      const registered = await repo.register({
        studentNumber: studentNumbers.first,
        platform: 2,
        fcmToken: 'token-a',
      });

      await repo.deactivate(registered.firebaseToken.firebase_token_id);

      const tokens = await repo.findActiveTokens();
      expect(
        tokens.find(
          token =>
            token.firebase_token_id ===
            registered.firebaseToken.firebase_token_id
        )
      ).toBeUndefined();
    });
  });
});
