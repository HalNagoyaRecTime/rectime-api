import { describe, expect, it, vi } from 'vitest';
import { createAccountDeletionService } from '../../../src/application/services/AccountDeletionService';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';
import type { IStudentRepository } from '../../../src/domain/interfaces/repositories/IStudentRepository';
import type { IStaffRepository } from '../../../src/domain/interfaces/repositories/IStaffRepository';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';
import type { IGatheringGroupMemberRepository } from '../../../src/domain/interfaces/repositories/IGatheringGroupMemberRepository';
import type { INotificationScheduleRepository } from '../../../src/domain/interfaces/repositories/INotificationScheduleRepository';
import type { IFirebaseTokenRepository } from '../../../src/domain/interfaces/repositories/IFirebaseTokenRepository';

function buildDeps() {
  const userRepository: IUserRepository = {
    exists: vi.fn(),
    isStaff: vi.fn(),
    getUserCategories: vi.fn(),
    findUserIdByMicrosoftAccount: vi.fn(),
    getDeletionStatus: vi.fn().mockResolvedValue('deleted'),
    createUserWithMicrosoftLink: vi.fn(),
    updateUser: vi.fn(),
    linkMicrosoftAccount: vi.fn(),
    markAsDeleted: vi.fn(),
    markAsPurged: vi.fn().mockResolvedValue(true),
    isPurged: vi.fn().mockResolvedValue(false),
    anonymizeUser: vi.fn().mockResolvedValue(true),
  };
  const studentRepository: IStudentRepository = {
    findById: vi.fn(),
    findByUserId: vi.fn(),
    findAll: vi.fn(),
    findByStudentNum: vi.fn(),
    findExistingStudentNumbers: vi.fn(),
    classRoomExists: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    createMany: vi.fn(),
    anonymizeByUserId: vi.fn().mockResolvedValue(true),
  };
  const staffRepository: IStaffRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    deleteByUserId: vi.fn().mockResolvedValue(true),
  };
  const teacherRepository: ITeacherRepository = {
    findById: vi.fn(),
    findAll: vi.fn(),
    existsClassRooms: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    deactivate: vi.fn(),
    deleteByUserId: vi.fn().mockResolvedValue(true),
  };
  const gatheringGroupMemberRepository: IGatheringGroupMemberRepository = {
    existsGathering: vi.fn(),
    existsUser: vi.fn(),
    findByGatheringId: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    deleteByUserId: vi.fn(),
  };
  const notificationScheduleRepository: INotificationScheduleRepository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findById: vi.fn(),
    deleteDraft: vi.fn(),
    findDraftsByEvent: vi.fn(),
    existsFirebaseToken: vi.fn(),
    existsEvent: vi.fn(),
    existsNotification: vi.fn(),
    findDeliveryCandidateIds: vi.fn(),
    claimForDelivery: vi.fn(),
    markSent: vi.fn(),
    markFailed: vi.fn(),
    anonymizeCreatedUserId: vi.fn(),
    deleteByFirebaseTokenId: vi.fn(),
  };
  const firebaseTokenRepository: IFirebaseTokenRepository = {
    register: vi.fn(),
    findActiveTokens: vi.fn(),
    deactivate: vi.fn(),
    deactivateByUserId: vi.fn(),
    findByUserId: vi.fn().mockResolvedValue(null),
    deleteByUserId: vi.fn(),
  };

  return {
    userRepository,
    studentRepository,
    staffRepository,
    teacherRepository,
    gatheringGroupMemberRepository,
    notificationScheduleRepository,
    firebaseTokenRepository,
  };
}

describe('createAccountDeletionService', () => {
  describe('deleteRelatedData', () => {
    it('deletion_statusが"deleted"でない場合は例外を投げ、他の処理を一切行わない', async () => {
      // authService.startAccountDeletion(markAsDeleted)より先にこの
      // メソッドが呼ばれた場合を再現する。呼び出し順序の誤りをコメントだけ
      // に頼らず、ここで検知できることを確認する。
      const deps = buildDeps();
      (
        deps.userRepository.getDeletionStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValue('active');
      const service = createAccountDeletionService(deps);

      await expect(service.deleteRelatedData('10')).rejects.toThrow(
        'ACCOUNT_NOT_MARKED_AS_DELETED'
      );
      expect(deps.firebaseTokenRepository.findByUserId).not.toHaveBeenCalled();
      expect(deps.staffRepository.deleteByUserId).not.toHaveBeenCalled();
      expect(deps.userRepository.markAsPurged).not.toHaveBeenCalled();
    });

    it('deletion_statusが"deletion_pending"の場合も例外を投げる(markAsDeleted完了前)', async () => {
      const deps = buildDeps();
      (
        deps.userRepository.getDeletionStatus as ReturnType<typeof vi.fn>
      ).mockResolvedValue('deletion_pending');
      const service = createAccountDeletionService(deps);

      await expect(service.deleteRelatedData('10')).rejects.toThrow(
        'ACCOUNT_NOT_MARKED_AS_DELETED'
      );
    });

    it('後片付けが既に完了済み(isPurged: true)の場合は例外を投げ、再実行しない', async () => {
      // 完了済みの利用者に対してdeleteRelatedDataが再度呼ばれても、
      // 既に匿名化・削除済みのデータへ無意味な書き込みをしない。
      const deps = buildDeps();
      (
        deps.userRepository.isPurged as ReturnType<typeof vi.fn>
      ).mockResolvedValue(true);
      const service = createAccountDeletionService(deps);

      await expect(service.deleteRelatedData('10')).rejects.toThrow(
        'ACCOUNT_ALREADY_PURGED'
      );
      expect(deps.userRepository.anonymizeUser).not.toHaveBeenCalled();
    });

    it('firebase_tokensが無い場合は通知履歴の削除・Token削除をスキップする', async () => {
      const deps = buildDeps();
      const service = createAccountDeletionService(deps);

      await service.deleteRelatedData('10');

      expect(deps.firebaseTokenRepository.findByUserId).toHaveBeenCalledWith(
        10
      );
      expect(
        deps.notificationScheduleRepository.deleteByFirebaseTokenId
      ).not.toHaveBeenCalled();
      expect(
        deps.firebaseTokenRepository.deleteByUserId
      ).not.toHaveBeenCalled();
    });

    it('firebase_tokensが存在する場合、通知履歴を先に削除してからToken本体を削除する', async () => {
      const deps = buildDeps();
      (
        deps.firebaseTokenRepository.findByUserId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        firebase_token_id: 5,
        user_id: 10,
        platform: 2,
        fcm_token: 'token-x',
        is_firebase_active: 0,
        last_seen_at: '2026-01-01 00:00:00',
        created_at: '2026-01-01 00:00:00',
        updated_at: '2026-01-01 00:00:00',
      });
      const callOrder: string[] = [];
      (
        deps.notificationScheduleRepository
          .deleteByFirebaseTokenId as ReturnType<typeof vi.fn>
      ).mockImplementation(async () => {
        callOrder.push('deleteByFirebaseTokenId');
      });
      (
        deps.firebaseTokenRepository.deleteByUserId as ReturnType<typeof vi.fn>
      ).mockImplementation(async () => {
        callOrder.push('deleteByUserId');
      });
      const service = createAccountDeletionService(deps);

      await service.deleteRelatedData('10');

      expect(
        deps.notificationScheduleRepository.deleteByFirebaseTokenId
      ).toHaveBeenCalledWith(5);
      expect(deps.firebaseTokenRepository.deleteByUserId).toHaveBeenCalledWith(
        10
      );
      // notification_schedulesの削除がfirebase_tokens削除より先に実行される
      // (firebase_token_idはNOT NULL外部キーのため)。
      expect(callOrder).toEqual(['deleteByFirebaseTokenId', 'deleteByUserId']);
    });

    it('通知の作成者情報をNULL化する', async () => {
      const deps = buildDeps();
      const service = createAccountDeletionService(deps);

      await service.deleteRelatedData('10');

      expect(
        deps.notificationScheduleRepository.anonymizeCreatedUserId
      ).toHaveBeenCalledWith(10);
    });

    it('ロール(staffs/teachers)・所属(gathering_group_members)を削除する', async () => {
      const deps = buildDeps();
      const service = createAccountDeletionService(deps);

      await service.deleteRelatedData('10');

      expect(deps.staffRepository.deleteByUserId).toHaveBeenCalledWith(10);
      expect(deps.teacherRepository.deleteByUserId).toHaveBeenCalledWith(10);
      expect(
        deps.gatheringGroupMemberRepository.deleteByUserId
      ).toHaveBeenCalledWith(10);
    });

    it('学生情報を匿名化する', async () => {
      const deps = buildDeps();
      const service = createAccountDeletionService(deps);

      await service.deleteRelatedData('10');

      expect(deps.studentRepository.anonymizeByUserId).toHaveBeenCalledWith(10);
    });

    it('学生かどうかに関係なくusers.user_nameを匿名化する', async () => {
      // students行を持たない教員・スタッフ限定のユーザーでも実名が
      // 残らないことを保証するための呼び出し。
      const deps = buildDeps();
      const service = createAccountDeletionService(deps);

      await service.deleteRelatedData('10');

      expect(deps.userRepository.anonymizeUser).toHaveBeenCalledWith('10');
    });

    it('各ステップは対象が存在しなくても(false/undefinedが返っても)処理を継続する', async () => {
      const deps = buildDeps();
      (
        deps.staffRepository.deleteByUserId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);
      (
        deps.teacherRepository.deleteByUserId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);
      (
        deps.studentRepository.anonymizeByUserId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);
      const service = createAccountDeletionService(deps);

      await expect(service.deleteRelatedData('10')).resolves.toBeUndefined();
      expect(
        deps.gatheringGroupMemberRepository.deleteByUserId
      ).toHaveBeenCalled();
    });

    it('全ステップが成功した場合のみmarkAsPurgedを呼び、deletion_statusを最終状態へ進める', async () => {
      const deps = buildDeps();
      const service = createAccountDeletionService(deps);

      await service.deleteRelatedData('10');

      expect(deps.userRepository.markAsPurged).toHaveBeenCalledWith('10');
    });

    it('途中のステップが失敗した場合はmarkAsPurgedを呼ばない(purgingのまま残し、再実行で拾えるようにする)', async () => {
      const deps = buildDeps();
      (
        deps.staffRepository.deleteByUserId as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('D1_UNAVAILABLE'));
      const service = createAccountDeletionService(deps);

      await expect(service.deleteRelatedData('10')).rejects.toThrow(
        'D1_UNAVAILABLE'
      );
      expect(deps.userRepository.markAsPurged).not.toHaveBeenCalled();
    });

    it('完了ログに各段が実際に対象を消したか(true/false)を記録する', async () => {
      const deps = buildDeps();
      (
        deps.staffRepository.deleteByUserId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);
      (
        deps.teacherRepository.deleteByUserId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(true);
      (
        deps.studentRepository.anonymizeByUserId as ReturnType<typeof vi.fn>
      ).mockResolvedValue(false);
      (
        deps.firebaseTokenRepository.findByUserId as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        firebase_token_id: 5,
        user_id: 10,
        platform: 2,
        fcm_token: 'token-x',
        is_firebase_active: 0,
        last_seen_at: '2026-01-01 00:00:00',
        created_at: '2026-01-01 00:00:00',
        updated_at: '2026-01-01 00:00:00',
      });
      const consoleLogSpy = vi
        .spyOn(console, 'log')
        .mockImplementation(() => {});
      const service = createAccountDeletionService(deps);

      await service.deleteRelatedData('10');

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ACCOUNT_DELETION] completed',
        {
          userId: '10',
          removed: {
            staff: false,
            teacher: true,
            student: false,
            firebaseToken: true,
            user: true,
          },
        }
      );
      consoleLogSpy.mockRestore();
    });

    it('途中のステップが失敗した場合、その段の名前をつけてconsole.errorに記録する(個人情報は含めない)', async () => {
      const deps = buildDeps();
      (
        deps.staffRepository.deleteByUserId as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('D1_UNAVAILABLE'));
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const service = createAccountDeletionService(deps);

      await expect(service.deleteRelatedData('10')).rejects.toThrow(
        'D1_UNAVAILABLE'
      );

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ACCOUNT_DELETION] failed',
        { userId: '10', step: 'staff' }
      );
      consoleErrorSpy.mockRestore();
    });
  });
});
