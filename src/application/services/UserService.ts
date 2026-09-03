import type { UserStatusEntity } from '../../domain/entities/User';
import type { IUserRepository } from '../../domain/interfaces/repositories/IUserRepository';
import type { IUserStatusRepository } from '../../domain/interfaces/repositories/IUserStatusRepository';
import type { UserStatusDTO } from '../dto/UserDTO';
import type { IUserService } from './IUserService';

// Domainの表現をAPIへ出す形へ明示的に変換する。現時点では同じ形だが、
// users側にフィールドが増えてもレスポンスが勝手に変わらないよう境界を残す。
function toDTO(user: UserStatusEntity): UserStatusDTO {
  return {
    user_id: user.user_id,
    is_live_active: user.is_live_active,
  };
}

export function createUserService(
  userRepository: IUserRepository,
  userStatusRepository: IUserStatusRepository
): IUserService {
  return {
    // User状態変更に必要な権限の判定はここに集約する。
    // 判定基準（staffのみか、staff+teacherか）を見直す場合はこの1箇所を変える。
    canManageUserStatus(userId) {
      return userRepository.isStaff(userId);
    },

    async updateUserStatus(command) {
      // 再有効化できるのは管理権限を持つUserだけなので、管理権限を持つUserが
      // 全員無効になると、このAPIからは誰も復旧できなくなる。
      //
      // 既知の制約: この確認と後続のupdateLiveActiveは別々のクエリで、
      // 間にトランザクションがない。異なる管理者を対象にした無効化が同時に
      // 走ると、双方がこの確認を通過して有効なstaffが0人になりうる。
      // 塞ぐなら「他に有効なstaffが存在する場合だけUPDATEする」条件付き更新に
      // まとめて原子的にする。管理者が少人数で同時操作も想定しにくいため、
      // 現時点ではリスクとして記録するに留める。
      if (!command.is_live_active) {
        if (command.operator_user_id === command.user_id) {
          throw new Error('Cannot deactivate yourself');
        }
        if (
          !(await userStatusRepository.hasOtherActiveStaff(command.user_id))
        ) {
          throw new Error('Cannot deactivate the last active staff');
        }
      }

      // Student / Teacher固有データや所属情報は触らず、users.is_live_activeのみ更新する。
      // 無効化しても再有効化時に無効化前の情報をそのまま利用できるのはこのため。
      const updated = await userStatusRepository.updateLiveActive(
        command.user_id,
        command.is_live_active
      );
      if (!updated) {
        throw new Error('User not found');
      }
      return toDTO(updated);
    },
  };
}
