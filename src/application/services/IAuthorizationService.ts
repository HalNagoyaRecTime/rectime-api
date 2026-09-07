export type IAuthorizationService = {
  isStaff: (userId: number) => Promise<boolean>;
};
