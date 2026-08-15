import type { AppUser, UserCategories } from '../../auth/types';

export interface IUserRepository {
  exists(userId: number): Promise<boolean>;
  isStaffOrTeacher(userId: number): Promise<boolean>;
  getUserCategories(userId: number): Promise<UserCategories>;
  findUserIdByMicrosoftAccount(
    oid: string,
    tid: string
  ): Promise<string | null>;
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
}
