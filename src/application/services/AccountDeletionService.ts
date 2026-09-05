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

      // 失敗した段の名前だけをログに残す。個人情報やTokenはログに含めない。
      // 完了ログでは各段が実際に対象を消したか(true/false)も記録するため、
      // 「後片付けは通ったが対象が1件も無かった」場合と「実際に消した」
      // 場合を後から見分けられる。
      const step = async <T>(
        name: string,
        run: () => Promise<T>
      ): Promise<T> => {
        try {
          return await run();
        } catch (error) {
          console.error('[ACCOUNT_DELETION] failed', { userId, step: name });
          throw error;
        }
      };

      // 呼び出し順序をコメントだけに頼らず、ここで自己確認する。
      // authService.startAccountDeletion(markAsDeleted)がdeletion_statusを
      // 'deleted'にし、Microsoftアカウントとの紐付けを断ち切った"後"で
      // なければ、対象ユーザー自身がまだ通常通りAPIを叩けてしまい、
      // firebase_tokens再登録やstudents更新などとの競合が起こり得る。
      // 呼び出し元が順序を誤った場合はここで即座に失敗させる。
      //
      // メッセージはAuthErrors.ACCOUNT_DELETION_NOT_STARTEDのcodeと
      // 一致させ、呼び出し元(presentation層)がerr.message === 'コード名'
      // で判別してAPIエラーへ変換できるようにする(#265, ACCOUNT_DELETION_
      // PENDINGと同じパターン)。
      const deletionStatus = await step('getDeletionStatus', () =>
        userRepository.getDeletionStatus(userId)
      );
      if (deletionStatus !== 'deleted') {
        throw new Error('ACCOUNT_DELETION_NOT_STARTED');
      }

      // markAsDeletedは完了しているが、関連データの削除・匿名化(後片付け)は
      // 複数テーブルへの個別の書き込みで構成され単一トランザクションに
      // できない。そのため「削除を受け付けた」(deletion_status='deleted')
      // と「後片付けまで完了した」(purged_at IS NOT NULL)を別に管理して
      // おり、既に後片付けが完了している利用者に対してここを素通りさせると
      // 既に匿名化・削除済みのデータへ無意味な書き込みを繰り返すことに
      // なるため、明示的に拒否する。途中で失敗した利用者はpurged_atが
      // NULLのまま残るため、`WHERE deletion_status = 'deleted' AND
      // purged_at IS NULL`で機械的に抽出し、同じuserIdで再実行できる。
      // メッセージはAuthErrors.ACCOUNT_ALREADY_PURGEDのcodeと一致させる
      // (上のACCOUNT_DELETION_NOT_STARTEDと同じ理由)。
      const alreadyPurged = await step('isPurged', () =>
        userRepository.isPurged(userId)
      );
      if (alreadyPurged) {
        throw new Error('ACCOUNT_ALREADY_PURGED');
      }

      // users.user_nameの匿名化はロールの種類によらず常に行う。
      // staffs/teachersの削除はロール用テーブルの行を消すだけで
      // users側の表示名には触れないため、ここで呼ばないと教員・スタッフの
      // 実名がusersテーブルに残り続けてしまう(利用者検索等にも表示され続ける)。
      const anonymizedUser = await step('anonymizeUser', () =>
        userRepository.anonymizeUser(userId)
      );

      // Microsoft連携・AUTH_KVのRefresh Session・Firebase Tokenの無効化は
      // authService.startAccountDeletion(#265 PR1/PR3)が既に担当済み。
      // ここでは以下のみ処理する。各ステップは対象が無ければ何もしない
      // (冪等)ため、途中で失敗しても同じuserIdで安全に再実行できる。
      //
      // firebase_tokensを物理削除する前に、それを参照する
      // notification_schedules(受信履歴)を先に削除する必要がある
      // (firebase_token_idはNOT NULL外部キーのため)。
      const firebaseTokenRemoved = await step('firebaseTokens', async () => {
        const firebaseToken =
          await firebaseTokenRepository.findByUserId(userIdNum);
        if (!firebaseToken) return false;
        await notificationScheduleRepository.deleteByFirebaseTokenId(
          firebaseToken.firebase_token_id
        );
        await firebaseTokenRepository.deleteByUserId(userIdNum);
        return true;
      });

      // 通知の作成者(管理者側)情報を匿名化する。通知自体(他の受信者宛て)は
      // 残す。
      await step('anonymizeCreatedUserId', () =>
        notificationScheduleRepository.anonymizeCreatedUserId(userIdNum)
      );

      // ロール・所属の解除。
      const removed = {
        staff: await step('staff', () =>
          staffRepository.deleteByUserId(userIdNum)
        ),
        teacher: await step('teacher', () =>
          teacherRepository.deleteByUserId(userIdNum)
        ),
        // 学生情報の匿名化。student_id_numberは再登録(#265 PR1で確定済み)の
        // ためUNIQUE制約を満たしたまま行を残す。user_nameはこの関数の先頭で
        // userRepository.anonymizeUserが既に匿名化済みのため、ここでは
        // students固有のカラムのみを扱う。
        student: await step('student', () =>
          studentRepository.anonymizeByUserId(userIdNum)
        ),
      };
      await step('gatheringGroupMember', () =>
        gatheringGroupMemberRepository.deleteByUserId(userIdNum)
      );

      // 全ステップが成功した時だけpurged_atをセットする。ここより前で
      // エラーがthrowされた場合はpurged_atがNULLのまま残るため、
      // `WHERE deletion_status = 'deleted' AND purged_at IS NULL` で
      // 未完了の利用者を抽出し、同じuserIdでdeleteRelatedDataを再実行
      // すれば続きから完了できる(各ステップは対象が無ければ何もしない
      // 冪等な実装のため)。
      await step('markAsPurged', () => userRepository.markAsPurged(userId));

      // 実際に何を消したかを1行にまとめて記録する。本人・運用側からの
      // 問い合わせ時に削除の実施記録として提示できるようにするため、
      // 個人情報やToken自体は含めず、各対象の有無(true/false)のみを残す。
      console.log('[ACCOUNT_DELETION] completed', {
        userId,
        removed: {
          ...removed,
          firebaseToken: firebaseTokenRemoved,
          user: anonymizedUser,
        },
      });
    },
  };
}
