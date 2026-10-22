import type { RefreshSession } from '../../auth/types';

export interface IRefreshSessionRepository {
  create: (session: RefreshSession, ttlSec: number) => Promise<void>;
  findById: (refreshTokenId: string) => Promise<RefreshSession | null>;
  findLatestByUserId: (userId: string) => Promise<RefreshSession | null>;
  rotate: (
    refreshTokenId: string,
    nextRefreshTokenId: string,
    msRefreshToken: string,
    ttlSec: number
  ) => Promise<boolean>;
  update: (
    refreshTokenId: string,
    changes: { ms_refresh_token?: string; avatar_updated_at?: string }
  ) => Promise<void>;
  cleanupForUser: (userId: string, refreshTokenId?: string) => Promise<void>;
  deleteByUserId: (userId: string) => Promise<void>;
  deleteExpired: () => Promise<void>;
}
