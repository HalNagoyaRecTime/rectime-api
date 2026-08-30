import type { AppUser, UserCategories } from '../../auth/types';

export type UserDeletionStatus = 'active' | 'deletion_pending' | 'deleted';

export interface IUserRepository {
  exists(userId: number): Promise<boolean>;
  isStaffOrTeacher(userId: number): Promise<boolean>;
  isStaff(userId: number): Promise<boolean>;
  getUserCategories(userId: number): Promise<UserCategories>;
  findUserIdByMicrosoftAccount(
    oid: string,
    tid: string
  ): Promise<string | null>;
  getDeletionStatus(userId: string): Promise<UserDeletionStatus | null>;
  createUserWithMicrosoftLink(params: {
    oid: string;
    tid: string;
    sub: string;
    email: string;
    displayName: string;
  }): Promise<AppUser>;
  updateUser(params: {
    userId: string;
    oid: string;
    tid: string;
    sub: string;
    email: string;
    displayName: string;
  }): Promise<AppUser | null>;
  linkMicrosoftAccount(params: {
    userId: string;
    oid: string;
    tid: string;
  }): Promise<void>;
  // deletion_statusを'deleted'にし、同時にmicrosoft_account_linksを削除する。
  // links を残したままだと、同一Microsoftアカウントでの再ログインが
  // findUserIdByMicrosoftAccount経由で古いdeletedユーザーを見つけてしまい、
  // 新規アカウントとしての再登録(#265で確定した方針)が成立しなくなる。
  // D1・KV・Firebaseにまたがる削除処理全体(#265 PR4)はこのメソッドの
  // 呼び出し元でオーケストレーションする想定で、ここではuser_idに対する
  // 最小限の状態遷移のみを担う。
  markAsDeleted(userId: string): Promise<boolean>;
}
