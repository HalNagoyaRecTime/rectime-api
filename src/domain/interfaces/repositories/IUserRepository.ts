import type { AppUser } from '../../auth/types';

export interface IUserRepository {
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
    uid: string;
    studentNumber: string;
  }): Promise<AppUser>;
  updateUser(params: {
    userId: string;
    oid: string;
    tid: string;
    sub: string;
    email: string;
    displayName: string;
    uid: string;
  }): Promise<AppUser>;
}
