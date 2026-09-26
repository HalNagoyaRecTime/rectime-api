export interface IRefreshSessionRepository {
  cleanupForUser: (userId: string, refreshTokenId?: string) => Promise<void>;
}
