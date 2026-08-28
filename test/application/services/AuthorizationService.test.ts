import { describe, expect, it, vi } from 'vitest';
import { createAuthorizationService } from '../../../src/application/services/AuthorizationService';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';

function buildUserRepository(
  overrides: Partial<IUserRepository> = {}
): IUserRepository {
  return {
    exists: vi.fn(),
    isStaff: vi.fn(),
    getUserCategories: vi.fn(),
    findUserIdByMicrosoftAccount: vi.fn(),
    createUserWithMicrosoftLink: vi.fn(),
    updateUser: vi.fn(),
    linkMicrosoftAccount: vi.fn(),
    ...overrides,
  };
}

describe('AuthorizationService', () => {
  it('isStaffはIUserRepository.isStaffへ委譲する', async () => {
    const isStaff = vi.fn().mockResolvedValue(true);
    const service = createAuthorizationService(
      buildUserRepository({ isStaff })
    );

    await expect(service.isStaff(1)).resolves.toBe(true);
    expect(isStaff).toHaveBeenCalledWith(1);
  });

  it('staffでなければfalseを返す', async () => {
    const service = createAuthorizationService(
      buildUserRepository({ isStaff: vi.fn().mockResolvedValue(false) })
    );

    await expect(service.isStaff(2)).resolves.toBe(false);
  });
});
