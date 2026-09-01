import type { UserStatusDTO } from '../dto/UserDTO';

export interface UpdateUserStatusCommand {
  user_id: number;
  // リクエストとレスポンスで同じ名前を使う。users.is_live_active に対応する。
  is_live_active: boolean;
}

export interface IUserService {
  canManageUserStatus(userId: number): Promise<boolean>;
  updateUserStatus(command: UpdateUserStatusCommand): Promise<UserStatusDTO>;
}
