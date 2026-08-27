import type { UserStatusDTO } from '../dto/UserDTO';

export interface UpdateUserStatusCommand {
  user_id: number;
  is_active: boolean;
}

export interface IUserService {
  canManageUserStatus(userId: number): Promise<boolean>;
  updateUserStatus(command: UpdateUserStatusCommand): Promise<UserStatusDTO>;
}
