import type { IAccountDeletionService } from './IAccountDeletionService';
import type { IStudentRepository } from '../../domain/interfaces/repositories/IStudentRepository';
import type { IStaffRepository } from '../../domain/interfaces/repositories/IStaffRepository';
import type { ITeacherRepository } from '../../domain/interfaces/repositories/ITeacherRepository';
import type { IGatheringGroupMemberRepository } from '../../domain/interfaces/repositories/IGatheringGroupMemberRepository';
import type { INotificationScheduleRepository } from '../../domain/interfaces/repositories/INotificationScheduleRepository';
import type { IFirebaseTokenRepository } from '../../domain/interfaces/repositories/IFirebaseTokenRepository';

export function createAccountDeletionService(deps: {
  studentRepository: IStudentRepository;
  staffRepository: IStaffRepository;
  teacherRepository: ITeacherRepository;
  gatheringGroupMemberRepository: IGatheringGroupMemberRepository;
  notificationScheduleRepository: INotificationScheduleRepository;
  firebaseTokenRepository: IFirebaseTokenRepository;
}): IAccountDeletionService {
  const {
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

      // Microsoft連携・AUTH_KVのRefresh Session・Firebase Tokenの無効化は
      // authService.startAccountDeletion(#265 PR1/PR3)が既に担当済み。
      // ここでは以下のみ処理する。各ステップは対象が無ければ何もしない
      // (冪等)ため、途中で失敗しても同じuserIdで安全に再実行できる。
      //
      // firebase_tokensを物理削除する前に、それを参照する
      // notification_schedules(受信履歴)を先に削除する必要がある
      // (firebase_token_idはNOT NULL外部キーのため)。
      const firebaseToken =
        await firebaseTokenRepository.findByUserId(userIdNum);
      if (firebaseToken) {
        await notificationScheduleRepository.deleteByFirebaseTokenId(
          firebaseToken.firebase_token_id
        );
        await firebaseTokenRepository.deleteByUserId(userIdNum);
      }

      // 通知の作成者(管理者側)情報を匿名化する。通知自体(他の受信者宛て)は
      // 残す。
      await notificationScheduleRepository.anonymizeCreatedUserId(userIdNum);

      // ロール・所属の解除。
      await staffRepository.deleteByUserId(userIdNum);
      await teacherRepository.deleteByUserId(userIdNum);
      await gatheringGroupMemberRepository.deleteByUserId(userIdNum);

      // 学生情報の匿名化。student_id_numberは再登録(#265 PR1で確定済み)の
      // ためUNIQUE制約を満たしたまま行を残す。
      await studentRepository.anonymizeByUserId(userIdNum);
    },
  };
}
