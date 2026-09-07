import { StaffEntity } from '../../entities/Staff';

export interface IStaffRepository {
  findById: (id: number) => Promise<StaffEntity | null>;
  findAll: () => Promise<StaffEntity[]>;
  // 該当するスタッフが存在しない場合は何もせずfalseを返す(冪等)。
  // アカウント削除の後片付けと、staff権限の解除の両方から利用する。
  deleteByUserId: (userId: number) => Promise<boolean>;
  // staff権限の付与。すでにstaffの場合は何もしない(冪等)。
  addByUserId: (userId: number) => Promise<void>;
  // 他に有効なstaffが残る場合だけ削除する。削除できたかどうかを返す。
  // 有効とは is_live_active が1で、かつ退会していないこと。
  // 確認と削除を1文にまとめてあるため、ほぼ同時に互いを解除しても0人にならない。
  deleteByUserIdUnlessLastActiveStaff: (userId: number) => Promise<boolean>;
  // 対象Userがstaffかどうか。削除できなかった理由の切り分けに使う。
  existsStaff: (userId: number) => Promise<boolean>;
  // 権限を付け外しする対象として妥当なUserが存在するか。
  // ここでのactiveはdeletion_status(退会したかどうか)を指す。管理上の
  // 一時無効化(is_live_active)は見ない。無効化中でもUserとしては残っており、
  // 権限の付け外し自体は成立するため。
  existsActiveUser: (userId: number) => Promise<boolean>;
}
