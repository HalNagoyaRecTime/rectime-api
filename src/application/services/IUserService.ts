import type { UserStatusDTO } from '../dto/UserDTO';

export interface UpdateUserStatusCommand {
  // 操作した本人。自分自身の無効化を断るために必要。
  operator_user_id: number;
  user_id: number;
  // リクエストとレスポンスで同じ名前を使う。users.is_live_active に対応する。
  is_live_active: boolean;
}

export interface IUserService {
  updateUserStatus(command: UpdateUserStatusCommand): Promise<UserStatusDTO>;
}
