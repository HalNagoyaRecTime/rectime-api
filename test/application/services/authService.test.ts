import { describe, expect, it, vi } from 'vitest';
import type { KVNamespace } from '@cloudflare/workers-types';
import {
  getSessionTtlSeconds,
  createAuthService,
} from '../../../src/application/services/authService';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';
import type { AppUser, Session } from '../../../src/domain/auth/types';
import type { MicrosoftClaims } from '../../../src/application/services/IAuthService';

function buildClaims(
  overrides: Partial<MicrosoftClaims> = {}
): MicrosoftClaims {
  return {
    oid: 'oid-1',
    tid: 'tid-1',
    sub: 'sub-1',
    name: '田中太郎',
    preferred_username: 'tanaka@example.com',
    ...overrides,
  };
}

function buildAppUser(overrides: Partial<AppUser> = {}): AppUser {
  return {
    id: 'user-1',
    oid: 'oid-1',
    tid: 'tid-1',
    sub: 'sub-1',
    email: 'tanaka@example.com',
    display_name: '田中太郎',
    ...overrides,
  };
}

describe('getSessionTtlSeconds', () => {
  it('未来の日時であれば正の秒数を返す', () => {
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    const ttl = getSessionTtlSeconds(future);
    expect(ttl).toBeGreaterThan(3500);
    expect(ttl).toBeLessThanOrEqual(3600);
  });

  it('過去の日時の場合は SESSION_ALREADY_EXPIRED を投げる', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    expect(() => getSessionTtlSeconds(past)).toThrow('SESSION_ALREADY_EXPIRED');
  });

  it('TTL が60秒未満の場合は SESSION_TTL_TOO_SHORT を投げる', () => {
    const soon = new Date(Date.now() + 30 * 1000).toISOString();
    expect(() => getSessionTtlSeconds(soon)).toThrow('SESSION_TTL_TOO_SHORT');
  });
});

describe('createAuthService', () => {
  function setup() {
    const userRepository: IUserRepository = {
      isStaffOrTeacher: vi.fn(),
      findUserIdByMicrosoftAccount: vi.fn(),
      createUserWithMicrosoftLink: vi.fn(),
      updateUser: vi.fn(),
    };
    const kv = { put: vi.fn() } as unknown as KVNamespace;
    const service = createAuthService(userRepository, kv);
    return { userRepository, kv, service };
  }

  describe('upsertUser', () => {
    it('既存ユーザーが見つかる場合は updateUser を呼び出す', async () => {
      const { userRepository, service } = setup();
      const claims = buildClaims();
      const updated = buildAppUser();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue('user-1');
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        updated
      );

      const result = await service.upsertUser(claims);

      expect(userRepository.updateUser).toHaveBeenCalledWith({
        userId: 'user-1',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });
      expect(result).toEqual(updated);
    });

    it('既存ユーザーが見つかるが update が null を返す場合は USER_NOT_FOUND を投げる', async () => {
      const { userRepository, service } = setup();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue('user-1');
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'USER_NOT_FOUND'
      );
    });

    it('既存ユーザーがいない場合は createUserWithMicrosoftLink を呼び出す', async () => {
      const { userRepository, service } = setup();
      const created = buildAppUser();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(created);

      const result = await service.upsertUser(buildClaims());

      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalledWith({
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        displayName: '田中太郎',
      });
      expect(result).toEqual(created);
    });

    it('preferred_username も email も無い場合は空文字メールと name をそのまま使う', async () => {
      const { userRepository, service } = setup();
      const claims = buildClaims({
        preferred_username: undefined,
        email: undefined,
        name: '山田花子',
      });
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockResolvedValue(buildAppUser());

      await service.upsertUser(claims);

      expect(userRepository.createUserWithMicrosoftLink).toHaveBeenCalledWith(
        expect.objectContaining({ email: '', displayName: '山田花子' })
      );
    });

    it('create 時に microsoft_account_links の UNIQUE 制約違反が発生した場合、再取得して update する', async () => {
      const { userRepository, service } = setup();
      const raced = buildAppUser();
      (userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('user-raced');
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error(
          'UNIQUE constraint failed: microsoft_account_links.oid, microsoft_account_links.tid'
        )
      );
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        raced
      );

      const result = await service.upsertUser(buildClaims());

      expect(userRepository.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-raced' })
      );
      expect(result).toEqual(raced);
    });

    it('create 時に無関係のエラーが発生した場合はそのまま投げる', async () => {
      const { userRepository, service } = setup();
      (
        userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('some other db error'));

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'some other db error'
      );
    });

    it('競合後の再取得でユーザーが見つからない場合は CREATE_USER_FAILED を投げる', async () => {
      const { userRepository, service } = setup();
      (userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('UNIQUE constraint failed: microsoft_account_links.oid')
      );

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'CREATE_USER_FAILED'
      );
    });

    it('競合後の update が null を返す場合は CREATE_USER_FAILED を投げる', async () => {
      const { userRepository, service } = setup();
      (userRepository.findUserIdByMicrosoftAccount as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('user-raced');
      (
        userRepository.createUserWithMicrosoftLink as ReturnType<typeof vi.fn>
      ).mockRejectedValue(
        new Error('UNIQUE constraint failed: microsoft_account_links.oid')
      );
      (userRepository.updateUser as ReturnType<typeof vi.fn>).mockResolvedValue(
        null
      );

      await expect(service.upsertUser(buildClaims())).rejects.toThrow(
        'CREATE_USER_FAILED'
      );
    });
  });

  describe('saveSession', () => {
    it('KV に session:<id> というキーで TTL 付きで保存する', async () => {
      const { kv, service } = setup();
      const session: Session = {
        user_id: 'user-1',
        oid: 'oid-1',
        tid: 'tid-1',
        sub: 'sub-1',
        email: 'tanaka@example.com',
        display_name: '田中太郎',
        expires_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      };

      await service.saveSession('session-abc', session);

      expect(kv.put).toHaveBeenCalledWith(
        'session:session-abc',
        JSON.stringify(session),
        expect.objectContaining({ expirationTtl: expect.any(Number) })
      );
    });
  });
});
