import { StaffEntity } from '../../entities/Staff';

export interface IStaffRepository {
  findById: (id: number) => Promise<StaffEntity | null>;
  findAll: () => Promise<StaffEntity[]>;
  // アカウント削除(#265 PR4)専用。該当するスタッフが存在しない場合は
  // 何もせずfalseを返す(冪等)。
  deleteByUserId: (userId: number) => Promise<boolean>;
}
