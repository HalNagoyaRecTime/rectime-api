import type { PkceEntry } from '../../auth/types';

export interface IAuthStateRepository {
  create: (state: string, entry: PkceEntry, ttlSec: number) => Promise<boolean>;
  find: (state: string) => Promise<PkceEntry | null>;
  consume: (state: string) => Promise<PkceEntry | null>;
  deleteExpired: () => Promise<void>;
}
