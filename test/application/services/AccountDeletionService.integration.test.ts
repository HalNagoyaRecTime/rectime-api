import { createNotificationDeliveryRepository } from '../../../src/infrastructure/repositories/NotificationDeliveryRepository';
import { createAdminNotificationCommandRepository } from '../../../src/infrastructure/repositories/AdminNotificationCommandRepository';
import { createNotificationAudienceResolverRepository } from '../../../src/infrastructure/repositories/NotificationAudienceResolverRepository';
import { createNotificationAudienceResolverService } from '../../../src/application/services/NotificationAudienceResolverService';
import { createNotificationScheduleQueryRepository } from '../../../src/infrastructure/repositories/NotificationScheduleQueryRepository';
import { createNotificationScheduleQueryService } from '../../../src/application/services/NotificationScheduleQueryService';
import { NOTIFICATION_AUDIENCE_USER_DELETED_REASON } from '../../../src/domain/entities/NotificationAudienceResolver';
import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAccountDeletionService } from '../../../src/application/services/AccountDeletionService';
import { createStudentRepository } from '../../../src/infrastructure/repositories/StudentRepository';
import { createStaffRepository } from '../../../src/infrastructure/repositories/StaffRepository';
import { createTeacherRepository } from '../../../src/infrastructure/repositories/TeacherRepository';
import { createGatheringGroupMemberRepository } from '../../../src/infrastructure/repositories/GatheringGroupMemberRepository';
import { createNotificationScheduleRepository } from '../../../src/infrastructure/repositories/NotificationScheduleRepository';
import { createNotificationAccountDeletionRepository } from '../../../src/infrastructure/repositories/NotificationAccountDeletionRepository';
import { createNotificationAccountDeletionService } from '../../../src/application/services/NotificationAccountDeletionService';
import { createFirebaseTokenRepository } from '../../../src/infrastructure/repositories/FirebaseTokenRepository';
import { createUserRepository } from '../../../src/infrastructure/repositories/UserRepository';
import type { IGatheringGroupMemberRepository } from '../../../src/domain/interfaces/repositories/IGatheringGroupMemberRepository';

// #265 PR4: 関連データの削除・匿名化を実DBで検証する。特に「D1・KV・
// Firebaseの途中で失敗しても、安全に再実行・再開できる」ことを、同じ
// userIdでdeleteRelatedDataを複数回呼んでも壊れないことで確認する。
describe('AccountDeletionService (実DB統合テスト)', () => {
  beforeEach(async () => {
    await workerEnv.DB.prepare('DELETE FROM gathering_group_members').run();
    await workerEnv.DB.prepare('DELETE FROM notification_schedules').run();
    await workerEnv.DB.prepare('DELETE FROM notifications').run();
    await workerEnv.DB.prepare('DELETE FROM gatherings').run();
    await workerEnv.DB.prepare('DELETE FROM events').run();
    await workerEnv.DB.prepare('DELETE FROM gathering_spots').run();
    await workerEnv.DB.prepare('DELETE FROM firebase_tokens').run();
    await workerEnv.DB.prepare('DELETE FROM microsoft_account_links').run();
    await workerEnv.DB.prepare('DELETE FROM staffs').run();
    await workerEnv.DB.prepare('DELETE FROM teachers').run();
    await workerEnv.DB.prepare('DELETE FROM students').run();
    await workerEnv.DB.prepare('DELETE FROM users').run();
  });

  // gatheringGroupMemberRepository.deleteByUserIdだけを失敗させ、
  // AccountDeletionService.deleteRelatedDataの途中失敗を再現するための
  // スタブ。deleteByUserId以外は本テストでは呼ばれない想定。
  function buildFailingGatheringGroupMemberRepository(): IGatheringGroupMemberRepository {
    return {
      existsGathering: async () => false,
      findByGatheringId: async () => [],
      findMissingUserIds: async () => [],
      applyMemberDiff: async () => [],
      deleteByUserId: async () => {
        throw new Error('SIMULATED_FAILURE');
      },
    };
  }

  function buildNotificationAccountDeletionService(db = workerEnv.DB) {
    return createNotificationAccountDeletionService({
      firebaseTokenRepository: createFirebaseTokenRepository(db),
      notificationScheduleRepository: createNotificationScheduleRepository(db),
      notificationAccountDeletionRepository:
        createNotificationAccountDeletionRepository(db),
    });
  }

  function buildService() {
    const db = workerEnv.DB;
    return createAccountDeletionService({
      userRepository: createUserRepository(db),
      studentRepository: createStudentRepository(db),
      staffRepository: createStaffRepository(db),
      teacherRepository: createTeacherRepository(db),
      gatheringGroupMemberRepository: createGatheringGroupMemberRepository(db),
      notificationAccountDeletionService:
        buildNotificationAccountDeletionService(db),
    });
  }

  // deleteRelatedDataはdeletion_status === 'deleted'を自己確認するため、
  // 実DBテストでは対象ユーザーを事前にこの状態にしておく必要がある
  // (authService.startAccountDeletion(markAsDeleted)が完了した後、という
  // 想定を再現する)。
  async function markAsDeleted(userId: number): Promise<void> {
    await workerEnv.DB.prepare(
      "UPDATE users SET deletion_status = 'deleted' WHERE user_id = ?"
    )
      .bind(userId)
      .run();
  }

  async function getUserDeletionState(userId: number): Promise<{
    deletion_status: string;
    purged_at: string | null;
  }> {
    const row = await workerEnv.DB.prepare(
      'SELECT deletion_status, purged_at FROM users WHERE user_id = ?'
    )
      .bind(userId)
      .first<{ deletion_status: string; purged_at: string | null }>();
    return row!;
  }

  const due = '2026-10-03T00:00:00.000Z';
  async function user(name: string) {
    const row = await workerEnv.DB.prepare(
      'INSERT INTO users (user_name) VALUES (?) RETURNING user_id'
    )
      .bind(name)
      .first<{ user_id: number }>();
    if (!row) throw new Error('User作成失敗');
    return row.user_id;
  }
  async function directSchedule(actorId: number, ids: number[]) {
    return createAdminNotificationCommandRepository(workerEnv.DB).create({
      actor_user_id: actorId,
      push_title: '削除テスト',
      push_body: '本文',
      detail_title: '削除テスト',
      detail_body: '本文',
      importance: 'normal',
      send_at: due,
      now: due,
      audiences: ids.map(id => ({ type: 'user' as const, target_id: id })),
    });
  }
  async function scheduleRow(id: number) {
    return workerEnv.DB.prepare(
      'SELECT send_status, reason, updated_at, recipients_resolved_at FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(id)
      .first();
  }
  it.each([
    ['scheduled', false],
    ['scheduled', true],
    ['resolving', false],
    ['resolving', true],
  ] as const)(
    '%sの直接User削除後に部分配信せず失敗理由を残す（複数Audience: %s）',
    async (status, multiple) => {
      const target = await user('削除対象');
      const other = await user('残る対象');
      const created = await directSchedule(
        other,
        multiple ? [target, other] : [target]
      );
      const unrelated = await directSchedule(other, [other]);
      const id = created.notification_schedule_id;
      await workerEnv.DB.prepare(
        'UPDATE notification_schedules SET send_status = ? WHERE notification_schedule_id = ?'
      )
        .bind(status, id)
        .run();
      await createUserRepository(workerEnv.DB).markAsDeleted(String(target));
      await buildService().deleteRelatedData(String(target));
      const failed = await scheduleRow(id);
      expect(failed).toMatchObject({
        send_status: 'failed',
        reason: NOTIFICATION_AUDIENCE_USER_DELETED_REASON,
        recipients_resolved_at: null,
      });
      const cleanup = createNotificationAccountDeletionRepository(workerEnv.DB);
      await cleanup.deleteDirectUserAudiencesByUserId(target);
      expect(await scheduleRow(id)).toEqual(failed);
      const resolver = createNotificationAudienceResolverService(
        createNotificationAudienceResolverRepository(workerEnv.DB)
      );
      const result = await resolver.resolveDueSchedules(new Date(due));
      expect(
        result.completed_schedules.map(row => row.notification_schedule_id)
      ).not.toContain(id);
      expect(
        result.completed_schedules.map(row => row.notification_schedule_id)
      ).toContain(unrelated.notification_schedule_id);
      expect(
        await workerEnv.DB.prepare(
          'SELECT COUNT(*) AS count FROM notification_recipients WHERE notification_schedule_id = ?'
        )
          .bind(id)
          .first()
      ).toEqual({ count: 0 });
      const deliveryRepo = createNotificationDeliveryRepository(workerEnv.DB);
      expect(
        (await deliveryRepo.findReadySchedules(due, 100)).map(
          row => row.notification_schedule_id
        )
      ).not.toContain(id);
      expect(await deliveryRepo.claimPendingDeliveries([id], due, 100)).toEqual(
        []
      );
      const query = createNotificationScheduleQueryService(
        createNotificationScheduleQueryRepository(workerEnv.DB)
      );
      expect(await query.getNotificationScheduleById(id)).toMatchObject({
        status: 'failed',
        failureReason: NOTIFICATION_AUDIENCE_USER_DELETED_REASON,
        stop: null,
      });
      expect(
        (await query.getNotificationSchedules({ from: due, to: due })).items
      ).toContainEqual(
        expect.objectContaining({
          notificationScheduleId: id,
          failureReason: NOTIFICATION_AUDIENCE_USER_DELETED_REASON,
        })
      );
    }
  );

  it('全User Audienceの一人が退会してもScheduleを失敗させない', async () => {
    const target = await user('間接対象の削除User');
    const other = await user('残るUser');
    const created = await directSchedule(other, [target]);
    const id = created.notification_schedule_id;
    await workerEnv.DB.prepare(
      "UPDATE notification_audiences SET audience_type = 'all', target_id = NULL WHERE notification_schedule_id = ?"
    )
      .bind(id)
      .run();
    await createUserRepository(workerEnv.DB).markAsDeleted(String(target));
    await buildService().deleteRelatedData(String(target));
    expect(await scheduleRow(id)).toMatchObject({
      send_status: 'scheduled',
      reason: null,
    });
    const resolver = createNotificationAudienceResolverService(
      createNotificationAudienceResolverRepository(workerEnv.DB)
    );
    expect(
      (await resolver.resolveDueSchedules(new Date(due))).completed_schedules
    ).toContainEqual({
      notification_schedule_id: id,
      recipient_count: 1,
    });
  });

  it('ResolverのAudience取得後に削除しても正常完了せず、確定済みの他Recipientを維持する', async () => {
    const target = await user('途中削除対象');
    const other = await user('確定済みの対象');
    const created = await directSchedule(other, [other, target]);
    const id = created.notification_schedule_id;
    const repo = createNotificationAudienceResolverRepository(workerEnv.DB);
    expect(await repo.claimScheduled(id, due)).toBe(true);
    const audiences = await repo.findUnresolvedAudiences(id);
    await repo.resolveAudience(id, audiences[0], due);
    await createUserRepository(workerEnv.DB).markAsDeleted(String(target));
    await buildService().deleteRelatedData(String(target));
    await expect(repo.resolveAudience(id, audiences[1], due)).rejects.toThrow();
    expect(await repo.completeScheduleIfResolved(id, due)).toBe(false);
    expect(await scheduleRow(id)).toMatchObject({
      send_status: 'failed',
      reason: NOTIFICATION_AUDIENCE_USER_DELETED_REASON,
    });
    expect(
      await workerEnv.DB.prepare(
        'SELECT user_id FROM notification_recipients WHERE notification_schedule_id = ?'
      )
        .bind(id)
        .all()
    ).toMatchObject({ results: [{ user_id: other }] });
  });

  it.each([
    'scheduled',
    'resolving',
    'sending',
    'completed',
    'stopped',
    'failed',
  ] as const)('対象確定済み・終了済みの%sを変更しない', async status => {
    const target = await user('確定後削除対象');
    const actor = await user('作成者');
    const created = await directSchedule(actor, [target]);
    const id = created.notification_schedule_id;
    await workerEnv.DB.prepare(
      'UPDATE notification_schedules SET send_status = ?, recipients_resolved_at = ?, reason = ? WHERE notification_schedule_id = ?'
    )
      .bind(
        status,
        status === 'scheduled' || status === 'resolving' || status === 'sending'
          ? due
          : null,
        '既存理由',
        id
      )
      .run();
    const original = await scheduleRow(id);
    await createNotificationAccountDeletionRepository(
      workerEnv.DB
    ).deleteDirectUserAudiencesByUserId(target);
    expect(await scheduleRow(id)).toEqual(original);
  });

  it('Audience削除が失敗したらSchedule更新もrollbackし、再実行で失敗理由を記録する', async () => {
    const target = await user('rollback対象');
    const actor = await user('作成者');
    const created = await directSchedule(actor, [target]);
    const id = created.notification_schedule_id;
    const original = await scheduleRow(id);
    const db = workerEnv.DB;
    const failingDb = new Proxy(db, {
      get(object, key) {
        if (key === 'batch')
          return (statements: D1PreparedStatement[]) =>
            db.batch([
              statements[0],
              db.prepare('DELETE FROM nonexistent_rollback_test'),
            ]);
        const value = Reflect.get(object, key);
        return typeof value === 'function' ? value.bind(object) : value;
      },
    });
    await expect(
      createNotificationAccountDeletionRepository(
        failingDb
      ).deleteDirectUserAudiencesByUserId(target)
    ).rejects.toThrow();
    expect(await scheduleRow(id)).toEqual(original);
    expect(
      await db
        .prepare(
          "SELECT COUNT(*) AS count FROM notification_audiences WHERE audience_type = 'user' AND target_id = ?"
        )
        .bind(target)
        .first()
    ).toEqual({ count: 1 });
    await createNotificationAccountDeletionRepository(
      db
    ).deleteDirectUserAudiencesByUserId(target);
    expect(await scheduleRow(id)).toMatchObject({
      send_status: 'failed',
      reason: NOTIFICATION_AUDIENCE_USER_DELETED_REASON,
    });
  });

  it('直接User Audienceを先に削除し、他Audience・履歴・actor参照を維持する', async () => {
    const targetUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('通知削除対象') RETURNING user_id"
    ).first<{ user_id: number }>();
    const otherUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('通知Recipient保持対象') RETURNING user_id"
    ).first<{ user_id: number }>();
    const notification = await workerEnv.DB.prepare(
      "INSERT INTO notifications (created_by_user_id, notification_type, push_title, push_body, title, body) VALUES (?, 'manual', '件名', '本文', '件名', '本文') RETURNING notification_id"
    )
      .bind(targetUser!.user_id)
      .first<{ notification_id: number }>();
    const schedule = await workerEnv.DB.prepare(
      "INSERT INTO notification_schedules (created_user_id, scheduled_by_user_id, stopped_by_user_id, notification_id, send_status, send_at) VALUES (?, ?, ?, ?, 'draft', '2026-09-24T09:00:00.000Z') RETURNING notification_schedule_id"
    )
      .bind(
        targetUser!.user_id,
        targetUser!.user_id,
        targetUser!.user_id,
        notification!.notification_id
      )
      .first<{ notification_schedule_id: number }>();
    const otherNotification = await workerEnv.DB.prepare(
      "INSERT INTO notifications (created_by_user_id, notification_type, push_title, push_body, title, body) VALUES (?, 'manual', '別件名', '別本文', '別件名', '別本文') RETURNING notification_id"
    )
      .bind(otherUser!.user_id)
      .first<{ notification_id: number }>();
    const completedSchedule = await workerEnv.DB.prepare(
      "INSERT INTO notification_schedules (created_user_id, scheduled_by_user_id, stopped_by_user_id, notification_id, send_status, send_at, recipients_resolved_at, started_at, completed_at) VALUES (?, ?, ?, ?, 'completed', '2026-09-24T09:00:00.000Z', '2026-09-24T09:01:00.000Z', '2026-09-24T09:02:00.000Z', '2026-09-24T09:03:00.000Z') RETURNING notification_schedule_id"
    )
      .bind(
        otherUser!.user_id,
        otherUser!.user_id,
        otherUser!.user_id,
        otherNotification!.notification_id
      )
      .first<{ notification_schedule_id: number }>();
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        'INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, ?, ?)'
      ).bind(schedule!.notification_schedule_id, 'user', targetUser!.user_id),
      workerEnv.DB.prepare(
        'INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, ?, ?)'
      ).bind(schedule!.notification_schedule_id, 'user', otherUser!.user_id),
      // polymorphicなtarget_idの数値が同じでも、class_room Audienceは残す。
      workerEnv.DB.prepare(
        'INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, ?, ?)'
      ).bind(
        schedule!.notification_schedule_id,
        'class_room',
        targetUser!.user_id
      ),
      workerEnv.DB.prepare(
        'INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, ?, ?)'
      ).bind(schedule!.notification_schedule_id, 'gathering', 9001),
      workerEnv.DB.prepare(
        'INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, ?, ?)'
      ).bind(schedule!.notification_schedule_id, 'event', 9002),
      workerEnv.DB.prepare(
        "INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, 'all', NULL)"
      ).bind(schedule!.notification_schedule_id),
      workerEnv.DB.prepare(
        'INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, ?, ?)'
      ).bind(
        completedSchedule!.notification_schedule_id,
        'user',
        targetUser!.user_id
      ),
    ]);
    const removedRecipient = await workerEnv.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
    )
      .bind(schedule!.notification_schedule_id, targetUser!.user_id)
      .first<{ notification_recipient_id: number }>();
    const keptRecipient = await workerEnv.DB.prepare(
      'INSERT INTO notification_recipients (notification_schedule_id, user_id) VALUES (?, ?) RETURNING notification_recipient_id'
    )
      .bind(schedule!.notification_schedule_id, otherUser!.user_id)
      .first<{ notification_recipient_id: number }>();
    await workerEnv.DB.batch([
      workerEnv.DB.prepare(
        "INSERT INTO notification_push_deliveries (notification_recipient_id, platform, status) VALUES (?, 1, 'pending')"
      ).bind(removedRecipient!.notification_recipient_id),
      workerEnv.DB.prepare(
        "INSERT INTO notification_push_deliveries (notification_recipient_id, platform, status) VALUES (?, 2, 'pending')"
      ).bind(keptRecipient!.notification_recipient_id),
    ]);
    await markAsDeleted(targetUser!.user_id);

    await buildService().deleteRelatedData(String(targetUser!.user_id));
    const targetAudiencesAfterFirstPurge = await workerEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM notification_audiences WHERE audience_type = 'user' AND target_id = ?"
    )
      .bind(targetUser!.user_id)
      .first<{ count: number }>();
    expect(targetAudiencesAfterFirstPurge?.count).toBe(0);
    // Account deletion全体の完了後も、通知cleanup単体は再実行できる。
    await buildNotificationAccountDeletionService().purgeUserNotificationData(
      targetUser!.user_id
    );

    const remainingAudiences = await workerEnv.DB.prepare(
      'SELECT notification_schedule_id, audience_type, target_id FROM notification_audiences ORDER BY notification_schedule_id, audience_type, target_id'
    ).all<{
      notification_schedule_id: number;
      audience_type: string;
      target_id: number | null;
    }>();
    expect(remainingAudiences.results).toEqual([
      {
        notification_schedule_id: schedule!.notification_schedule_id,
        audience_type: 'all',
        target_id: null,
      },
      {
        notification_schedule_id: schedule!.notification_schedule_id,
        audience_type: 'class_room',
        target_id: targetUser!.user_id,
      },
      {
        notification_schedule_id: schedule!.notification_schedule_id,
        audience_type: 'event',
        target_id: 9002,
      },
      {
        notification_schedule_id: schedule!.notification_schedule_id,
        audience_type: 'gathering',
        target_id: 9001,
      },
      {
        notification_schedule_id: schedule!.notification_schedule_id,
        audience_type: 'user',
        target_id: otherUser!.user_id,
      },
    ]);
    const remainingTargetAudiences = await workerEnv.DB.prepare(
      "SELECT COUNT(*) AS count FROM notification_audiences WHERE audience_type = 'user' AND target_id = ?"
    )
      .bind(targetUser!.user_id)
      .first<{ count: number }>();
    expect(remainingTargetAudiences?.count).toBe(0);

    const remainingRecipients = await workerEnv.DB.prepare(
      'SELECT user_id FROM notification_recipients WHERE notification_schedule_id = ? ORDER BY user_id'
    )
      .bind(schedule!.notification_schedule_id)
      .all<{ user_id: number }>();
    expect(remainingRecipients.results.map(row => row.user_id)).toEqual([
      otherUser!.user_id,
    ]);
    const remainingDeliveries = await workerEnv.DB.prepare(
      'SELECT notification_recipient_id FROM notification_push_deliveries ORDER BY notification_recipient_id'
    ).all<{ notification_recipient_id: number }>();
    expect(
      remainingDeliveries.results.map(row => row.notification_recipient_id)
    ).toEqual([keptRecipient!.notification_recipient_id]);
    const notificationActor = await workerEnv.DB.prepare(
      'SELECT created_by_user_id, updated_at FROM notifications WHERE notification_id = ?'
    )
      .bind(notification!.notification_id)
      .first<{ created_by_user_id: number | null; updated_at: string }>();
    expect(notificationActor?.created_by_user_id).toBeNull();
    expect(notificationActor?.updated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    const scheduleActors = await workerEnv.DB.prepare(
      'SELECT created_user_id, scheduled_by_user_id, stopped_by_user_id, updated_at FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(schedule!.notification_schedule_id)
      .first<{
        created_user_id: number | null;
        scheduled_by_user_id: number | null;
        stopped_by_user_id: number | null;
        updated_at: string;
      }>();
    expect(scheduleActors).toEqual({
      created_user_id: null,
      scheduled_by_user_id: null,
      stopped_by_user_id: null,
      updated_at: notificationActor!.updated_at,
    });
    expect(scheduleActors?.updated_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
    );
    const otherNotificationActor = await workerEnv.DB.prepare(
      'SELECT created_by_user_id FROM notifications WHERE notification_id = ?'
    )
      .bind(otherNotification!.notification_id)
      .first<{ created_by_user_id: number | null }>();
    expect(otherNotificationActor?.created_by_user_id).toBe(otherUser!.user_id);
    const completedScheduleState = await workerEnv.DB.prepare(
      'SELECT created_user_id, scheduled_by_user_id, stopped_by_user_id, send_status, recipients_resolved_at, started_at, completed_at FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(completedSchedule!.notification_schedule_id)
      .first();
    expect(completedScheduleState).toEqual({
      created_user_id: otherUser!.user_id,
      scheduled_by_user_id: otherUser!.user_id,
      stopped_by_user_id: otherUser!.user_id,
      send_status: 'completed',
      recipients_resolved_at: '2026-09-24T09:01:00.000Z',
      started_at: '2026-09-24T09:02:00.000Z',
      completed_at: '2026-09-24T09:03:00.000Z',
    });
    const retainedCompletedSchedule = await workerEnv.DB.prepare(
      'SELECT notification_schedule_id FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(completedSchedule!.notification_schedule_id)
      .first();
    expect(retainedCompletedSchedule).not.toBeNull();
    const retainedNotification = await workerEnv.DB.prepare(
      'SELECT notification_id FROM notifications WHERE notification_id = ?'
    )
      .bind(otherNotification!.notification_id)
      .first();
    expect(retainedNotification).not.toBeNull();
  });

  it.each([
    {
      caseName: 'scheduled=A / stopped=B',
      scheduledActor: 'target' as const,
      stoppedActor: 'other' as const,
    },
    {
      caseName: 'scheduled=B / stopped=A',
      scheduledActor: 'other' as const,
      stoppedActor: 'target' as const,
    },
  ])(
    '$caseNameのSchedule actorは対象列だけNULL化する',
    async ({ scheduledActor, stoppedActor }) => {
      const targetUser = await workerEnv.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('actor匿名化対象') RETURNING user_id"
      ).first<{ user_id: number }>();
      const otherUser = await workerEnv.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('actor保持対象') RETURNING user_id"
      ).first<{ user_id: number }>();
      const notification = await workerEnv.DB.prepare(
        "INSERT INTO notifications (created_by_user_id, notification_type, push_title, push_body, title, body) VALUES (?, 'manual', 'actor件名', 'actor本文', 'actor件名', 'actor本文') RETURNING notification_id"
      )
        .bind(otherUser!.user_id)
        .first<{ notification_id: number }>();
      const actorId = (actor: 'target' | 'other') =>
        actor === 'target' ? targetUser!.user_id : otherUser!.user_id;
      const schedule = await workerEnv.DB.prepare(
        "INSERT INTO notification_schedules (created_user_id, scheduled_by_user_id, stopped_by_user_id, notification_id, send_status, send_at) VALUES (?, ?, ?, ?, 'draft', '2026-09-24T09:00:00.000Z') RETURNING notification_schedule_id"
      )
        .bind(
          otherUser!.user_id,
          actorId(scheduledActor),
          actorId(stoppedActor),
          notification!.notification_id
        )
        .first<{ notification_schedule_id: number }>();

      await buildNotificationAccountDeletionService().purgeUserNotificationData(
        targetUser!.user_id
      );

      const actors = await workerEnv.DB.prepare(
        'SELECT scheduled_by_user_id, stopped_by_user_id FROM notification_schedules WHERE notification_schedule_id = ?'
      )
        .bind(schedule!.notification_schedule_id)
        .first<{
          scheduled_by_user_id: number | null;
          stopped_by_user_id: number | null;
        }>();
      expect(actors).toEqual({
        scheduled_by_user_id:
          scheduledActor === 'target' ? null : otherUser!.user_id,
        stopped_by_user_id:
          stoppedActor === 'target' ? null : otherUser!.user_id,
      });
    }
  );

  it('学生ユーザーの関連データを削除・匿名化し、再実行しても安全である', async () => {
    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('DEL-INT-1', '削除統合テストクラス') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('統合削除太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '77001')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
      .run();

    const event = await workerEnv.DB.prepare(
      "INSERT INTO events (event_name, start_time, end_time) VALUES ('統合削除競技', '0900', '1000') RETURNING event_id"
    ).first<{ event_id: number }>();
    const spot = await workerEnv.DB.prepare(
      "INSERT INTO gathering_spots (gathering_spot_name) VALUES ('統合削除集合場所') RETURNING gathering_spot_id"
    ).first<{ gathering_spot_id: number }>();
    const gathering = await workerEnv.DB.prepare(
      'INSERT INTO gatherings (event_id, gathering_spot_id) VALUES (?, ?) RETURNING gathering_id'
    )
      .bind(event!.event_id, spot!.gathering_spot_id)
      .first<{ gathering_id: number }>();
    await workerEnv.DB.prepare(
      'INSERT INTO gathering_group_members (gathering_id, user_id) VALUES (?, ?)'
    )
      .bind(gathering!.gathering_id, user!.user_id)
      .run();

    const firebaseToken = await workerEnv.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token, is_firebase_active) VALUES (?, 2, 'integration-token-1', 0) RETURNING firebase_token_id"
    )
      .bind(user!.user_id)
      .first<{ firebase_token_id: number }>();
    const notification = await workerEnv.DB.prepare(
      "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('manual', '件名', '本文', '件名', '本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    const receivedSchedule = await workerEnv.DB.prepare(
      "INSERT INTO notification_schedules (created_user_id, event_id, notification_id, firebase_token_id, send_status, send_at) VALUES (NULL, ?, ?, ?, 'draft', '2026-07-23T09:00:00.000Z') RETURNING notification_schedule_id"
    )
      .bind(
        event!.event_id,
        notification!.notification_id,
        firebaseToken!.firebase_token_id
      )
      .first<{ notification_schedule_id: number }>();

    // 削除対象ユーザーが「送信者(作成者)」だった通知(他ユーザー宛て)も
    // 用意し、created_user_idだけがNULL化され通知自体は残ることを確認する。
    const otherUser = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('無関係な受信者') RETURNING user_id"
    ).first<{ user_id: number }>();
    const otherToken = await workerEnv.DB.prepare(
      "INSERT INTO firebase_tokens (user_id, platform, fcm_token) VALUES (?, 2, 'integration-other-token') RETURNING firebase_token_id"
    )
      .bind(otherUser!.user_id)
      .first<{ firebase_token_id: number }>();
    const createdSchedule = await workerEnv.DB.prepare(
      "INSERT INTO notification_schedules (created_user_id, event_id, notification_id, firebase_token_id, send_status, send_at) VALUES (?, ?, ?, ?, 'draft', '2026-07-23T09:00:00.000Z') RETURNING notification_schedule_id"
    )
      .bind(
        user!.user_id,
        event!.event_id,
        notification!.notification_id,
        otherToken!.firebase_token_id
      )
      .first<{ notification_schedule_id: number }>();

    await markAsDeleted(user!.user_id);
    const service = buildService();

    await service.deleteRelatedData(String(user!.user_id));

    // 全ステップ完了後はpurged_atがセットされる。
    const stateAfterComplete = await getUserDeletionState(user!.user_id);
    expect(stateAfterComplete.deletion_status).toBe('deleted');
    expect(stateAfterComplete.purged_at).not.toBeNull();

    // students: 行は残るが匿名化されている
    const studentRow = await workerEnv.DB.prepare(
      'SELECT student_id_number FROM students WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ student_id_number: string }>();
    expect(studentRow?.student_id_number).toBe(`deleted-${user!.user_id}`);

    // gathering_group_members: 削除される
    const memberRow = await workerEnv.DB.prepare(
      'SELECT * FROM gathering_group_members WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(memberRow).toBeNull();

    // firebase_tokens: 物理削除される
    const tokenRow = await workerEnv.DB.prepare(
      'SELECT * FROM firebase_tokens WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(tokenRow).toBeNull();

    // 受信履歴(firebase_token_id経由): 物理削除される
    const receivedRow = await workerEnv.DB.prepare(
      'SELECT * FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(receivedSchedule!.notification_schedule_id)
      .first();
    expect(receivedRow).toBeNull();

    // 作成者としての通知: created_user_idのみNULL化され、通知自体は残る
    const createdRow = await workerEnv.DB.prepare(
      'SELECT created_user_id FROM notification_schedules WHERE notification_schedule_id = ?'
    )
      .bind(createdSchedule!.notification_schedule_id)
      .first<{ created_user_id: number | null }>();
    expect(createdRow).not.toBeNull();
    expect(createdRow?.created_user_id).toBeNull();

    // 後片付けが完了済み(purged_at IS NOT NULL)の利用者に対する再実行は、
    // 無意味な書き込みを繰り返さないよう拒否される。
    await expect(
      service.deleteRelatedData(String(user!.user_id))
    ).rejects.toThrow('ACCOUNT_ALREADY_PURGED');

    // 拒否後も状態は変わらない
    const studentRowAfterRetry = await workerEnv.DB.prepare(
      'SELECT student_id_number FROM students WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ student_id_number: string }>();
    expect(studentRowAfterRetry?.student_id_number).toBe(
      `deleted-${user!.user_id}`
    );
  });

  it('教員ユーザーの削除でclass_rooms.teacher_idがNULL化され、user_nameも匿名化される', async () => {
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('統合削除教員') RETURNING user_id"
    ).first<{ user_id: number }>();
    const teacher = await workerEnv.DB.prepare(
      'INSERT INTO teachers (user_id, email) VALUES (?, ?) RETURNING teacher_id'
    )
      .bind(user!.user_id, `teacher-${user!.user_id}@example.test`)
      .first<{ teacher_id: number }>();
    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name, teacher_id) VALUES ('DEL-INT-2', '削除統合テストクラス2', ?) RETURNING class_room_id"
    )
      .bind(teacher!.teacher_id)
      .first<{ class_room_id: number }>();

    await markAsDeleted(user!.user_id);
    const service = buildService();
    await service.deleteRelatedData(String(user!.user_id));

    const teacherRow = await workerEnv.DB.prepare(
      'SELECT * FROM teachers WHERE teacher_id = ?'
    )
      .bind(teacher!.teacher_id)
      .first();
    expect(teacherRow).toBeNull();

    const classRoomRow = await workerEnv.DB.prepare(
      'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
    )
      .bind(classRoom!.class_room_id)
      .first<{ teacher_id: number | null }>();
    expect(classRoomRow?.teacher_id).toBeNull();

    // teachers行は物理削除されており(students行を持たない)、user_nameの
    // 匿名化がstudents経由の副作用に依存していると実名が残ってしまう。
    // ここでは学生でなくても匿名化されることを確認する。
    const userRow = await workerEnv.DB.prepare(
      'SELECT user_name FROM users WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ user_name: string }>();
    expect(userRow?.user_name).toBe('削除済みユーザー');
    expect(
      (await getUserDeletionState(user!.user_id)).purged_at
    ).not.toBeNull();

    // 完了済みへの再実行は拒否される
    await expect(
      service.deleteRelatedData(String(user!.user_id))
    ).rejects.toThrow('ACCOUNT_ALREADY_PURGED');
  });

  it('一部の関連データだけ既に削除された状態(途中失敗を模した状態)から再実行しても完了できる', async () => {
    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('DEL-INT-3', '再開テストクラス') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('再開テスト太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '77002')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
      .run();
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();

    await markAsDeleted(user!.user_id);
    const service = buildService();

    // 1回目の呼び出しを「途中まで進んだ状態」として扱い、staffsだけが
    // 既に削除済み・studentsはまだ未処理という状況を人為的に作る
    // (D1・KV・Firebaseの複数ストレージにまたがる処理が途中で中断した場合、
    // 一部だけ成功して一部が未処理のまま残ることを想定している)。
    await workerEnv.DB.prepare('DELETE FROM staffs WHERE user_id = ?')
      .bind(user!.user_id)
      .run();

    // 途中失敗した利用者はpurged_atがNULLのまま残るため、
    // `WHERE deletion_status = 'deleted' AND purged_at IS NULL`で
    // 機械的に抽出できる(今回のレビュー指摘の核心: 誰かが申告するまで
    // 気付けない、という状態を作らない)。
    const stateBeforeRetry = await getUserDeletionState(user!.user_id);
    expect(stateBeforeRetry.deletion_status).toBe('deleted');
    expect(stateBeforeRetry.purged_at).toBeNull();

    // 中断後の再実行を模す。staffsは既に無いが、エラーにならず
    // students等の残りの処理が完了することを確認する。
    await expect(
      service.deleteRelatedData(String(user!.user_id))
    ).resolves.toBeUndefined();

    const studentRow = await workerEnv.DB.prepare(
      'SELECT student_id_number FROM students WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ student_id_number: string }>();
    expect(studentRow?.student_id_number).toBe(`deleted-${user!.user_id}`);

    // 再実行が完了するとpurged_atがセットされ、抽出対象から外れる。
    expect(
      (await getUserDeletionState(user!.user_id)).purged_at
    ).not.toBeNull();
  });

  it('途中のステップで例外が発生した場合、purged_atはNULLのまま残り、後から抽出・再実行できる', async () => {
    // AccountDeletionService.deleteRelatedDataは複数テーブルへの個別の
    // 書き込みで構成され単一トランザクションにできないため、途中で
    // 例外が起きた利用者は`WHERE deletion_status = 'deleted' AND
    // purged_at IS NULL`で機械的に抽出できる必要がある(今回のレビュー
    // 指摘)。ここではgatheringGroupMemberRepository.deleteByUserId
    // (anonymizeUser・staffs削除より後に実行される)だけを失敗する
    // モックに差し替え、それ以外は実DBのリポジトリを使うことで、
    // 途中失敗を再現する。
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('例外テスト太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    const notification = await workerEnv.DB.prepare(
      "INSERT INTO notifications (notification_type, push_title, push_body, title, body) VALUES ('manual', '件名', '本文', '件名', '本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    const schedule = await workerEnv.DB.prepare(
      "INSERT INTO notification_schedules (notification_id, send_status, send_at) VALUES (?, 'draft', '2026-09-24T09:00:00.000Z') RETURNING notification_schedule_id"
    )
      .bind(notification!.notification_id)
      .first<{ notification_schedule_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO notification_audiences (notification_schedule_id, audience_type, target_id) VALUES (?, 'user', ?)"
    )
      .bind(schedule!.notification_schedule_id, user!.user_id)
      .run();
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();

    await markAsDeleted(user!.user_id);
    const db = workerEnv.DB;
    const service = createAccountDeletionService({
      userRepository: createUserRepository(db),
      studentRepository: createStudentRepository(db),
      staffRepository: createStaffRepository(db),
      teacherRepository: createTeacherRepository(db),
      gatheringGroupMemberRepository:
        buildFailingGatheringGroupMemberRepository(),
      notificationAccountDeletionService:
        buildNotificationAccountDeletionService(db),
    });

    await expect(
      service.deleteRelatedData(String(user!.user_id))
    ).rejects.toThrow('SIMULATED_FAILURE');

    // 途中で失敗しても、途中まで完了したステップ(anonymizeUser・staffs削除)
    // は確定したまま残り、purged_atはNULLのまま。
    const state = await getUserDeletionState(user!.user_id);
    expect(state.deletion_status).toBe('deleted');
    expect(state.purged_at).toBeNull();
    const staffRow = await workerEnv.DB.prepare(
      'SELECT * FROM staffs WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(staffRow).toBeNull();
    const audienceAfterFailure = await workerEnv.DB.prepare(
      'SELECT notification_audience_id FROM notification_audiences WHERE notification_schedule_id = ?'
    )
      .bind(schedule!.notification_schedule_id)
      .first();
    expect(audienceAfterFailure).toBeNull();

    const unpurgedUsers = await workerEnv.DB.prepare(
      "SELECT user_id FROM users WHERE deletion_status = 'deleted' AND purged_at IS NULL"
    ).all<{ user_id: number }>();
    expect(unpurgedUsers.results.map(r => r.user_id)).toContain(user!.user_id);
  });

  it('同一user_idがstaffs・teachers・studentsに同時に存在する場合も、それぞれ独立して正しく処理される', async () => {
    // staffs/teachersは相互排他ではない設計(既存コードのコメント参照)。
    // 通常の運用では起こりにくいが、同一user_idが複数ロールに同時に
    // 存在するケースでも、各リポジトリのdeleteByUserId/anonymizeByUserId
    // が独立してWHERE user_id = ?で動作し、正しく処理されることを確認する。
    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('DEL-INT-4', '複合ロールテストクラス') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('複合ロール太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '77003')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
      .run();
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();
    const teacher = await workerEnv.DB.prepare(
      'INSERT INTO teachers (user_id, email) VALUES (?, ?) RETURNING teacher_id'
    )
      .bind(user!.user_id, `teacher-${user!.user_id}@example.test`)
      .first<{ teacher_id: number }>();
    await workerEnv.DB.prepare(
      'UPDATE class_rooms SET teacher_id = ? WHERE class_room_id = ?'
    )
      .bind(teacher!.teacher_id, classRoom!.class_room_id)
      .run();

    await markAsDeleted(user!.user_id);
    const service = buildService();
    await service.deleteRelatedData(String(user!.user_id));

    const staffRow = await workerEnv.DB.prepare(
      'SELECT * FROM staffs WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(staffRow).toBeNull();

    const teacherRow = await workerEnv.DB.prepare(
      'SELECT * FROM teachers WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(teacherRow).toBeNull();

    const classRoomRow = await workerEnv.DB.prepare(
      'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
    )
      .bind(classRoom!.class_room_id)
      .first<{ teacher_id: number | null }>();
    expect(classRoomRow?.teacher_id).toBeNull();

    const studentRow = await workerEnv.DB.prepare(
      'SELECT student_id_number FROM students WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ student_id_number: string }>();
    expect(studentRow?.student_id_number).toBe(`deleted-${user!.user_id}`);
  });

  it('スタッフのみ(students/teachers行を持たない)のユーザーでもuser_nameが匿名化される', async () => {
    // このケースはstudentRepository.anonymizeByUserId(students行が
    // 存在する場合のみ動く)には一切依存しない、最も直接的な確認。
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('統合削除スタッフ') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
      .bind(user!.user_id)
      .run();

    await markAsDeleted(user!.user_id);
    const service = buildService();
    await service.deleteRelatedData(String(user!.user_id));

    const staffRow = await workerEnv.DB.prepare(
      'SELECT * FROM staffs WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first();
    expect(staffRow).toBeNull();

    const userRow = await workerEnv.DB.prepare(
      'SELECT user_name FROM users WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ user_name: string }>();
    expect(userRow?.user_name).toBe('削除済みユーザー');
  });

  it('関連データが何も無いユーザーでもエラーにならない(冪等)', async () => {
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('関連データなし') RETURNING user_id"
    ).first<{ user_id: number }>();

    await markAsDeleted(user!.user_id);
    const service = buildService();

    await expect(
      service.deleteRelatedData(String(user!.user_id))
    ).resolves.toBeUndefined();
  });

  it('deletion_statusがdeletedでないユーザーに対しては例外を投げ、何も変更しない', async () => {
    const classRoom = await workerEnv.DB.prepare(
      "INSERT INTO class_rooms (class_code, class_name) VALUES ('DEL-INT-5', '順序違反テストクラス') RETURNING class_room_id"
    ).first<{ class_room_id: number }>();
    const user = await workerEnv.DB.prepare(
      "INSERT INTO users (user_name) VALUES ('順序違反太郎') RETURNING user_id"
    ).first<{ user_id: number }>();
    await workerEnv.DB.prepare(
      "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '77004')"
    )
      .bind(user!.user_id, classRoom!.class_room_id)
      .run();

    // markAsDeletedを呼ばず(deletion_status: 'active'のまま)deleteRelatedData
    // を呼ぶ、順序違反のケース。
    const service = buildService();

    await expect(
      service.deleteRelatedData(String(user!.user_id))
    ).rejects.toThrow('ACCOUNT_DELETION_NOT_STARTED');

    const studentRow = await workerEnv.DB.prepare(
      'SELECT student_id_number FROM students WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ student_id_number: string }>();
    expect(studentRow?.student_id_number).toBe('77004');
  });

  // #345: index.tsのscheduledハンドラ(日次Cron)から呼ばれる
  // retryPendingPurgesが、実DB上でfindPendingPurgeUserIdsが返す対象と
  // 噛み合って正しく動作することを確認する(モックだけでは
  // findPendingPurgeUserIdsのSQL条件とdeleteRelatedDataの自己確認条件が
  // 噛み合っているかまでは検証できない)。
  describe('retryPendingPurges (実DB統合テスト)', () => {
    it('後片付けが未完了の利用者だけを拾って完了させ、既に完了済み・未削除の利用者は対象にしない', async () => {
      const pending = await workerEnv.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('後片付け未完了太郎') RETURNING user_id"
      ).first<{ user_id: number }>();
      await workerEnv.DB.prepare('INSERT INTO staffs (user_id) VALUES (?)')
        .bind(pending!.user_id)
        .run();
      await markAsDeleted(pending!.user_id);

      const alreadyPurged = await workerEnv.DB.prepare(
        "INSERT INTO users (user_name, deletion_status, purged_at) VALUES ('完了済み太郎', 'deleted', CURRENT_TIMESTAMP) RETURNING user_id"
      ).first<{ user_id: number }>();

      const active = await workerEnv.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('未削除太郎') RETURNING user_id"
      ).first<{ user_id: number }>();

      const service = buildService();
      const result = await service.retryPendingPurges(100);

      expect(result.targetCount).toBe(1);
      expect(result.succeededCount).toBe(1);
      expect(result.failedCount).toBe(0);

      // 未完了だった利用者は後片付けが完了する。
      const pendingState = await getUserDeletionState(pending!.user_id);
      expect(pendingState.purged_at).not.toBeNull();
      const staffRow = await workerEnv.DB.prepare(
        'SELECT * FROM staffs WHERE user_id = ?'
      )
        .bind(pending!.user_id)
        .first();
      expect(staffRow).toBeNull();

      // 既に完了済み・未削除の利用者はretryPendingPurgesの対象に含まれず、
      // 状態が変わらない。
      const alreadyPurgedState = await getUserDeletionState(
        alreadyPurged!.user_id
      );
      expect(alreadyPurgedState.deletion_status).toBe('deleted');
      const activeState = await getUserDeletionState(active!.user_id);
      expect(activeState.deletion_status).toBe('active');
    });

    it('途中失敗で後片付けが未完了のまま残った利用者を、再度のretryPendingPurges呼び出しで拾い直せる', async () => {
      const classRoom = await workerEnv.DB.prepare(
        "INSERT INTO class_rooms (class_code, class_name) VALUES ('DEL-INT-6', '再実行テストクラス') RETURNING class_room_id"
      ).first<{ class_room_id: number }>();
      const user = await workerEnv.DB.prepare(
        "INSERT INTO users (user_name) VALUES ('再実行対象太郎') RETURNING user_id"
      ).first<{ user_id: number }>();
      await workerEnv.DB.prepare(
        "INSERT INTO students (user_id, class_room_id, attendance_number, student_id_number) VALUES (?, ?, 1, '77005')"
      )
        .bind(user!.user_id, classRoom!.class_room_id)
        .run();
      await markAsDeleted(user!.user_id);

      const db = workerEnv.DB;
      const failingService = createAccountDeletionService({
        userRepository: createUserRepository(db),
        studentRepository: createStudentRepository(db),
        staffRepository: createStaffRepository(db),
        teacherRepository: createTeacherRepository(db),
        gatheringGroupMemberRepository:
          buildFailingGatheringGroupMemberRepository(),
        notificationAccountDeletionService:
          buildNotificationAccountDeletionService(db),
      });

      const firstResult = await failingService.retryPendingPurges(100);
      expect(firstResult.targetCount).toBe(1);
      expect(firstResult.succeededCount).toBe(0);
      expect(firstResult.failedCount).toBe(1);
      expect((await getUserDeletionState(user!.user_id)).purged_at).toBeNull();

      // 正常なリポジトリ構成で再実行すると、findPendingPurgeUserIdsが
      // 同じuserIdを再び抽出し、今度は完了する。
      const recoveringService = buildService();
      const secondResult = await recoveringService.retryPendingPurges(100);
      expect(secondResult.targetCount).toBe(1);
      expect(secondResult.succeededCount).toBe(1);
      expect(secondResult.failedCount).toBe(0);
      expect(
        (await getUserDeletionState(user!.user_id)).purged_at
      ).not.toBeNull();
    });
  });
});
