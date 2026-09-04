import type { IAccountDeletionService } from './IAccountDeletionService';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import type { IStaffRepository } from '../../domain/interfaces/repositories/IStaffRepository';
import type { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import type { IGatheringGroupMemberRepository } from '../../domain/interfaces/repositories/IGatheringGroupMemberRepository';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';

export function createAccountDeletionService(deps: {
  userRepository: IUserRepository;
  studentRepository: IStudentRepository;
  staffRepository: IStaffRepository;
  teacherRepository: ITeacherRepository;
  gatheringGroupMemberRepository: IGatheringGroupMemberRepository;
  notificationScheduleRepository: INotificationScheduleRepository;
  firebaseTokenRepository: IFirebaseTokenRepository;
}): IAccountDeletionService {
  const {
    userRepository,
    studentRepository,
    staffRepository,
    teacherRepository,
    gatheringGroupMemberRepository,
    notificationScheduleRepository,
    firebaseTokenRepository,
  } = deps;

  return {
    async deleteRelatedData(userId: string) {
      const userIdNum = Number(userId);

      // 呼び出し順序をコメントだけに頼らず、ここで自己確認する。
      // authService.startAccountDeletion(markAsDeleted)がdeletion_statusを
      // 'deleted'にし、Microsoftアカウントとの紐付けを断ち切った"後"で
      // なければ、対象ユーザー自身がまだ通常通りAPIを叩けてしまい、
      // firebase_tokens再登録やstudents更新などとの競合が起こり得る。
      // 呼び出し元が順序を誤った場合はここで即座に失敗させる。
      const deletionStatus = await userRepository.getDeletionStatus(userId);
      if (deletionStatus !== 'deleted') {
        throw new Error(
          'ACCOUNT_NOT_MARKED_AS_DELETED: deleteRelatedData was called before ' +
            'authService.startAccountDeletion completed (deletion_status must ' +
            "be 'deleted')"
        );
      }

      // users.user_nameの匿名化はロールの種類によらず常に行う。
      // staffs/teachersの削除はロール用テーブルの行を消すだけで
      // users側の表示名には触れないため、ここで呼ばないと教員・スタッフの
      // 実名がusersテーブルに残り続けてしまう(利用者検索等にも表示され続ける)。
      console.log('[ACCOUNT_DELETION] anonymizeUser: start', { userId });
      await userRepository.anonymizeUser(userId);
      console.log('[ACCOUNT_DELETION] anonymizeUser: done', { userId });

      // Microsoft連携・AUTH_KVのRefresh Session・Firebase Tokenの無効化は
      // authService.startAccountDeletion(#265 PR1/PR3)が既に担当済み。
      // ここでは以下のみ処理する。各ステップは対象が無ければ何もしない
      // (冪等)ため、途中で失敗しても同じuserIdで安全に再実行できる。
      //
      // firebase_tokensを物理削除する前に、それを参照する
      // notification_schedules(受信履歴)を先に削除する必要がある
      // (firebase_token_idはNOT NULL外部キーのため)。
      console.log('[ACCOUNT_DELETION] firebaseTokens: start', { userId });
      const firebaseToken =
        await firebaseTokenRepository.findByUserId(userIdNum);
      if (firebaseToken) {
        await notificationScheduleRepository.deleteByFirebaseTokenId(
          firebaseToken.firebase_token_id
        );
        await firebaseTokenRepository.deleteByUserId(userIdNum);
      }
      console.log('[ACCOUNT_DELETION] firebaseTokens: done', { userId });

      // 通知の作成者(管理者側)情報を匿名化する。通知自体(他の受信者宛て)は
      // 残す。
      console.log('[ACCOUNT_DELETION] anonymizeCreatedUserId: start', {
        userId,
      });
      await notificationScheduleRepository.anonymizeCreatedUserId(userIdNum);
      console.log('[ACCOUNT_DELETION] anonymizeCreatedUserId: done', {
        userId,
      });

      // ロール・所属の解除。
      console.log('[ACCOUNT_DELETION] roles: start', { userId });
      await staffRepository.deleteByUserId(userIdNum);
      await teacherRepository.deleteByUserId(userIdNum);
      await gatheringGroupMemberRepository.deleteByUserId(userIdNum);
      console.log('[ACCOUNT_DELETION] roles: done', { userId });

      // 学生情報の匿名化。student_id_numberは再登録(#265 PR1で確定済み)の
      // ためUNIQUE制約を満たしたまま行を残す。user_nameはこの関数の先頭で
      // userRepository.anonymizeUserが既に匿名化済みのため、ここでは
      // students固有のカラムのみを扱う。
      console.log('[ACCOUNT_DELETION] anonymizeStudent: start', { userId });
      await studentRepository.anonymizeByUserId(userIdNum);
      console.log('[ACCOUNT_DELETION] anonymizeStudent: done', { userId });

      console.log('[ACCOUNT_DELETION] deleteRelatedData: completed', {
        userId,
      });
    },
  };
}
