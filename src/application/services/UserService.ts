import type { UserStatusEntity } from '../../domain/entities/User';
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
  userStatusRepository: IUserStatusRepository
): IUserService {
  return {
    async updateUserStatus(command) {
      // 再有効化できるのは管理権限を持つUserだけなので、管理権限を持つUserが
      // 全員無効になると、このAPIからは誰も復旧できなくなる。自分自身の無効化は
      // ここで断り、他に稼働中のstaffがいるかどうかは更新と同じSQL文で判定する。
      if (!command.is_live_active) {
        if (command.operator_user_id === command.user_id) {
          throw new Error('Cannot deactivate yourself');
        }
      }

      // Student / Teacher固有データや所属情報は触らず、users.is_live_activeのみ更新する。
      // 無効化しても再有効化時に無効化前の情報をそのまま利用できるのはこのため。
      const updated = await userStatusRepository.updateLiveActive(
        command.user_id,
        command.is_live_active
      );
      if (updated) {
        return toDTO(updated);
      }

      // 更新できなかった理由を切り分ける。対象が残っているなら、断られたのは
      // 「最後の稼働中staffだったため」。
      if (
        !command.is_live_active &&
        (await userStatusRepository.existsActiveUser(command.user_id))
      ) {
        throw new Error('Cannot deactivate the last active staff');
      }
      throw new Error('User not found');
    },
  };
}
