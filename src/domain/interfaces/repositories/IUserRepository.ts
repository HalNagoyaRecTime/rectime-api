import type { AppUser } from '../../auth/types';

export interface IUserRepository {
  isStaffOrTeacher(userId: number): Promise<boolean>;
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
}
