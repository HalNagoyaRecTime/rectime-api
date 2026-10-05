import { StaffDTO } from '../dto/StaffDTO';

export interface RevokeStaffRoleCommand {
  // 操作した本人。自分自身の解除を断るために必要。
  operator_user_id: number;
  user_id: number;
}

export interface IStaffService {
  getStaffById: (id: number) => Promise<StaffDTO>;
  getAllStaffs: () => Promise<StaffDTO[]>;
  // 対象Userのstaff権限を付与・解除する。すでに目的の状態であっても
  // エラーにはしない(冪等)。
  assignStaffRole: (userId: number) => Promise<void>;
  // 付与と違い操作者を受け取る。自分自身の解除だけは断るため。
  revokeStaffRole: (command: RevokeStaffRoleCommand) => Promise<void>;
}
