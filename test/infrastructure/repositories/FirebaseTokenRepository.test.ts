import { env } from 'cloudflare:workers';
import { drizzle } from 'drizzle-orm/d1';
import { describe, expect, it } from 'vitest';
import * as schema from '../../../src/infrastructure/database/schema';
import {
  entries,
  firebase_tokens,
  notification_users,
} from '../../../src/infrastructure/database/schema';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import { seedEvents } from '../../fixtures/events';
import { seedStudents } from '../../fixtures/students';

describe('FirebaseTokenRepository', () => {
  it('競技参加者に紐付く有効なFCM TokenだけをDrizzleで取得する', async () => {
    const students = await seedStudents(env.DB);
    const events = await seedEvents(env.DB);
    const orm = drizzle(env.DB, { schema });
    const repository = createFirebaseTokenRepository(env.DB);

    const [notificationUser] = await orm
      .insert(notification_users)
      .values({
        studentNumber: students.students[0].studentIdNumber,
      })
      .returning();
    const [firebaseToken] = await orm
      .insert(firebase_tokens)
      .values({
        userId: notificationUser.id,
        platform: 'android',
        fcmToken: 'participant-token',
      })
      .returning();
    await orm.insert(entries).values({
      studentId: students.students[0].studentId,
      eventId: events.events[0].eventId,
    });

    const tokens = await repository.findActiveTokensForEvent(
      events.events[0].eventId
    );

    expect(tokens).toEqual([
      expect.objectContaining({
        id: firebaseToken.id,
        user_id: notificationUser.id,
        fcm_token: 'participant-token',
        is_active: 1,
      }),
    ]);
  });
});
