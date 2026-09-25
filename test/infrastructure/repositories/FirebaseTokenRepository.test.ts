import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';

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
    const classRoom = await env.DB.prepare(
      'INSERT INTO class_rooms (class_code, class_name) VALUES (?, ?) RETURNING class_room_id'
    )
      .bind(`FIREBASE-TEST-${sequence}`, 'Firebaseトークンテスト用学級')
      .first<{ class_room_id: number }>();
    classRoomId = classRoom!.class_room_id;
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
        await env.DB.prepare(
          'INSERT INTO teachers (user_id, email) VALUES (?, ?)'
        )
          .bind(userId, `teacher-${userId}@example.test`)
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

  it('iOS Tokenをplatform=1で登録できる', async () => {
    const userId = await createUser('Firebase iOS利用者');

    await expect(
      repository.register({
        userId,
        platform: 'ios',
        fcmToken: 'token-ios',
      })
    ).resolves.toMatchObject({
      user_id: userId,
      platform: 'ios',
      is_firebase_active: true,
    });

    const stored = await env.DB.prepare(
      'SELECT platform FROM firebase_tokens WHERE fcm_token = ?'
    )
      .bind('token-ios')
      .first<{ platform: number }>();
    expect(stored?.platform).toBe(1);
  });

  it('登録日時をUTC ISO形式で保存する', async () => {
    const userId = await createUser('Firebase日時形式');
    const registered = await repository.register({
      userId,
      platform: 'android',
      fcmToken: 'token-datetime',
    });

    const utcIso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
    expect(registered.last_seen_at).toMatch(utcIso);

    const stored = await env.DB.prepare(
      `SELECT last_seen_at, created_at, updated_at
       FROM firebase_tokens WHERE user_id = ?`
    )
      .bind(userId)
      .first<{
        last_seen_at: string;
        created_at: string;
        updated_at: string;
      }>();
    expect(stored?.last_seen_at).toMatch(utcIso);
    expect(stored?.created_at).toMatch(utcIso);
    expect(stored?.updated_at).toMatch(utcIso);
  });

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

  it('同じTokenを別利用者が登録したら旧Tokenを削除し、Delivery参照をNULLにする', async () => {
    const previousOwnerId = await createUser('Firebase Token旧所有者');
    const newOwnerId = await createUser('Firebase Token新所有者');
    const previous = await repository.register({
      userId: previousOwnerId,
      platform: 'android',
      fcmToken: 'token-handover',
    });

    const notification = await env.DB.prepare(
      "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('manual', 'handover', 'body', 'handover', 'body') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    if (!notification)
      throw new Error('failed to create handover notification');
    const schedule = await env.DB.prepare(
      "INSERT INTO notification_schedules (notification_id, firebase_token_id, send_status, send_at) VALUES (?, ?, 'draft', CURRENT_TIMESTAMP) RETURNING notification_schedule_id"
    )
      .bind(notification.notification_id, previous.firebase_token_id)
      .first<{ notification_schedule_id: number }>();
    if (!schedule) throw new Error('failed to create handover schedule');
    const recipient = await env.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
    )
      .bind(schedule.notification_schedule_id, previousOwnerId)
      .first<{ notification_recipient_id: number }>();
    if (!recipient) throw new Error('failed to create handover recipient');
    const delivery = await env.DB.prepare(
      "INSERT INTO notification_push_deliveries (notification_recipient_id, firebase_token_id, platform, status) VALUES (?, ?, 2, 'sent') RETURNING notification_push_delivery_id"
    )
      .bind(recipient.notification_recipient_id, previous.firebase_token_id)
      .first<{ notification_push_delivery_id: number }>();
    if (!delivery) throw new Error('failed to create handover delivery');

    const current = await repository.register({
      userId: newOwnerId,
      platform: 'android',
      fcmToken: 'token-handover',
    });

    expect(current.firebase_token_id).not.toBe(previous.firebase_token_id);
    expect(current.user_id).toBe(newOwnerId);
    expect(current.is_firebase_active).toBe(true);
    const previousRow = await env.DB.prepare(
      'SELECT user_id FROM firebase_tokens WHERE firebase_token_id = ?'
    )
      .bind(previous.firebase_token_id)
      .first();
    expect(previousRow).toBeNull();

    const detachedDelivery = await env.DB.prepare(
      'SELECT firebase_token_id FROM notification_push_deliveries WHERE notification_push_delivery_id = ?'
    )
      .bind(delivery.notification_push_delivery_id)
      .first<{ firebase_token_id: number | null }>();
    expect(detachedDelivery).toEqual({ firebase_token_id: null });
    const detachedSchedule = await env.DB.prepare(
      'SELECT firebase_token_id FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(schedule.notification_schedule_id)
      .first<{ firebase_token_id: number | null }>();
    expect(detachedSchedule).toEqual({ firebase_token_id: null });

    const activeTokens = await repository.findActiveTokens();
    expect(activeTokens).toHaveLength(1);
    expect(activeTokens[0].user_id).toBe(newOwnerId);

    await env.DB.prepare(
      'DELETE FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(schedule.notification_schedule_id)
      .run();
    await env.DB.prepare('DELETE FROM notifications WHERE notification_id = ?')
      .bind(notification.notification_id)
      .run();
  });
  it('Token所有権変更後に旧所有者が別端末を登録すると新しいrowを作る', async () => {
    const previousOwnerId = await createUser('Firebase Token再登録旧所有者');
    const newOwnerId = await createUser('Firebase Token再登録新所有者');
    const previous = await repository.register({
      userId: previousOwnerId,
      platform: 'android',
      fcmToken: 'token-handover-again',
    });
    await repository.register({
      userId: newOwnerId,
      platform: 'android',
      fcmToken: 'token-handover-again',
    });

    const reregistered = await repository.register({
      userId: previousOwnerId,
      platform: 'android',
      fcmToken: 'token-new-device',
    });

    expect(reregistered.firebase_token_id).not.toBe(previous.firebase_token_id);
    expect(reregistered.user_id).toBe(previousOwnerId);
    expect(reregistered.is_firebase_active).toBe(true);
    const rowCount = await env.DB.prepare(
      'SELECT COUNT(*) AS count FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(previousOwnerId)
      .first<{ count: number }>();
    expect(rowCount?.count).toBe(1);
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

  it('同じTokenを別利用者が同時に登録しても有効な行を1つに保つ', async () => {
    const firstUserId = await createUser('Firebase Token同時登録1');
    const secondUserId = await createUser('Firebase Token同時登録2');

    await Promise.all([
      repository.register({
        userId: firstUserId,
        platform: 'android',
        fcmToken: 'token-simultaneous',
      }),
      repository.register({
        userId: secondUserId,
        platform: 'android',
        fcmToken: 'token-simultaneous',
      }),
    ]);

    const rows = await env.DB.prepare(
      `SELECT user_id, is_firebase_active
       FROM firebase_tokens
       WHERE fcm_token = ?`
    )
      .bind('token-simultaneous')
      .all<{ user_id: number; is_firebase_active: number }>();
    expect(rows.results).toHaveLength(1);
    expect(
      rows.results.filter(row => row.is_firebase_active === 1)
    ).toHaveLength(1);
  });

  it('存在しないUserへの登録失敗時に他UserのTokenを削除しない', async () => {
    const ownerId = await createUser('Firebase Token所有者');
    await repository.register({
      userId: ownerId,
      platform: 'android',
      fcmToken: 'token-owned',
    });

    await expect(
      repository.register({
        userId: 999999,
        platform: 'android',
        fcmToken: 'token-owned',
      })
    ).rejects.toThrow('User not found');

    const stored = await env.DB.prepare(
      'SELECT user_id FROM firebase_tokens WHERE fcm_token = ?'
    )
      .bind('token-owned')
      .first<{ user_id: number }>();

    expect(stored?.user_id).toBe(ownerId);
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

  describe('deactivateByUserId', () => {
    it('指定したuser_idのToken登録を無効化する', async () => {
      const userId = await createUser('削除対象利用者');
      await repository.register({
        userId,
        platform: 'android',
        fcmToken: 'token-to-deactivate',
      });

      await repository.deactivateByUserId(userId);

      const stored = await env.DB.prepare(
        'SELECT is_firebase_active FROM firebase_tokens WHERE user_id = ?'
      )
        .bind(userId)
        .first<{ is_firebase_active: number }>();
      expect(stored?.is_firebase_active).toBe(0);
    });

    it('他のuser_idのToken登録には影響しない', async () => {
      const targetUserId = await createUser('削除対象利用者2');
      const otherUserId = await createUser('無関係な利用者');
      await repository.register({
        userId: targetUserId,
        platform: 'android',
        fcmToken: 'token-target',
      });
      await repository.register({
        userId: otherUserId,
        platform: 'android',
        fcmToken: 'token-other',
      });

      await repository.deactivateByUserId(targetUserId);

      const otherStored = await env.DB.prepare(
        'SELECT is_firebase_active FROM firebase_tokens WHERE user_id = ?'
      )
        .bind(otherUserId)
        .first<{ is_firebase_active: number }>();
      expect(otherStored?.is_firebase_active).toBe(1);
    });

    it('Token登録が存在しないuser_idでもエラーにならない', async () => {
      const userId = await createUser('Token未登録利用者');

      await expect(
        repository.deactivateByUserId(userId)
      ).resolves.toBeUndefined();
    });
  });

  describe('findByUserId / deleteByUserId', () => {
    it('findByUserIdは指定user_idのToken登録を返す', async () => {
      const userId = await createUser('検索対象利用者');
      await repository.register({
        userId,
        platform: 'android',
        fcmToken: 'token-findable',
      });

      const found = await repository.findByUserId(userId);

      expect(found).toMatchObject({
        user_id: userId,
        fcm_token: 'token-findable',
      });
    });

    it('findByUserIdは登録が無い場合はnullを返す', async () => {
      const userId = await createUser('Token未登録利用者2');

      await expect(repository.findByUserId(userId)).resolves.toBeNull();
    });

    it('deleteByUserIdはToken登録を物理削除する', async () => {
      const userId = await createUser('物理削除対象利用者');
      await repository.register({
        userId,
        platform: 'android',
        fcmToken: 'token-to-delete',
      });

      await repository.deleteByUserId(userId);

      const stored = await env.DB.prepare(
        'SELECT * FROM firebase_tokens WHERE user_id = ?'
      )
        .bind(userId)
        .first();
      expect(stored).toBeNull();
    });

    it('deleteByUserIdは登録が無くてもエラーにならない(冪等)', async () => {
      const userId = await createUser('Token未登録利用者3');

      await expect(repository.deleteByUserId(userId)).resolves.toBeUndefined();
    });
  });
});
