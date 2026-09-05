import { env as workerEnv } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createAccountDeletionService } from '../../../src/application/services/AccountDeletionService';
import { createStudentRepository } from '../../../src/infrastructure/repositories/StudentRepository';
import { createStaffRepository } from '../../../src/infrastructure/repositories/StaffRepository';
import { createTeacherRepository } from '../../../src/infrastructure/repositories/TeacherRepository';
import { createGatheringGroupMemberRepository } from '../../../src/infrastructure/repositories/GatheringGroupMemberRepository';
import { createNotificationScheduleRepository } from '../../../src/infrastructure/repositories/NotificationScheduleRepository';
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
      existsUser: async () => false,
      findByGatheringId: async () => [],
      create: async () => {
        throw new Error('NOT_IMPLEMENTED_IN_TEST_STUB');
      },
      remove: async () => false,
      deleteByUserId: async () => {
        throw new Error('SIMULATED_FAILURE');
      },
    };
  }

  function buildService() {
    const db = workerEnv.DB;
    return createAccountDeletionService({
      userRepository: createUserRepository(db),
      studentRepository: createStudentRepository(db),
      staffRepository: createStaffRepository(db),
      teacherRepository: createTeacherRepository(db),
      gatheringGroupMemberRepository: createGatheringGroupMemberRepository(
        db,
        createUserRepository(db)
      ),
      notificationScheduleRepository: createNotificationScheduleRepository(db),
      firebaseTokenRepository: createFirebaseTokenRepository(db),
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
      "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('統合削除競技', '体育館', '0900', '1000') RETURNING event_id"
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
      "INSERT INTO notifications (notification_type, title, body) VALUES ('manual', '件名', '本文') RETURNING notification_id"
    ).first<{ notification_id: number }>();
    const receivedSchedule = await workerEnv.DB.prepare(
      "INSERT INTO notification_schedules (created_user_id, event_id, notification_id, firebase_token_id, send_at) VALUES (NULL, ?, ?, ?, '2026-07-23T09:00:00.000Z') RETURNING notification_schedule_id"
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
      "INSERT INTO notification_schedules (created_user_id, event_id, notification_id, firebase_token_id, send_at) VALUES (?, ?, ?, ?, '2026-07-23T09:00:00.000Z') RETURNING notification_schedule_id"
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
      'INSERT INTO teachers (user_id) VALUES (?) RETURNING teacher_id'
    )
      .bind(user!.user_id)
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
      notificationScheduleRepository: createNotificationScheduleRepository(db),
      firebaseTokenRepository: createFirebaseTokenRepository(db),
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
      'INSERT INTO teachers (user_id) VALUES (?) RETURNING teacher_id'
    )
      .bind(user!.user_id)
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
    ).rejects.toThrow('ACCOUNT_NOT_MARKED_AS_DELETED');

    const studentRow = await workerEnv.DB.prepare(
      'SELECT student_id_number FROM students WHERE user_id = ?'
    )
      .bind(user!.user_id)
      .first<{ student_id_number: string }>();
    expect(studentRow?.student_id_number).toBe('77004');
  });
});
