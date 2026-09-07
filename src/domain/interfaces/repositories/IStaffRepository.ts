import { StaffEntity } from '../../entities/Staff';

export interface IStaffRepository {
  findById: (id: number) => Promise<StaffEntity | null>;
  findAll: () => Promise<StaffEntity[]>;
  // 該当するスタッフが存在しない場合は何もせずfalseを返す(冪等)。
  // アカウント削除の後片付けと、staff権限の解除の両方から利用する。
  deleteByUserId: (userId: number) => Promise<boolean>;
  // staff権限の付与。すでにstaffの場合は何もしない(冪等)。
  addByUserId: (userId: number) => Promise<void>;
  // 権限を付け外しする対象として妥当なUserが存在するか。
  // ここでのactiveはdeletion_status(退会したかどうか)を指す。管理上の
  // 一時無効化(is_live_active)は見ない。無効化中でもUserとしては残っており、
  // 権限の付け外し自体は成立するため。
  existsActiveUser: (userId: number) => Promise<boolean>;
}
