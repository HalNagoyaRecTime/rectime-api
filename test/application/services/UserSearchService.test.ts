import { describe, expect, it, vi } from 'vitest';
import { createUserSearchService } from '../../../src/application/services/UserSearchService';
import type { IUserRepository } from '../../../src/domain/interfaces/repositories/IUserRepository';
import type { IUserSearchRepository } from '../../../src/domain/interfaces/repositories/IUserSearchRepository';

function setup() {
  const userSearchRepository: IUserSearchRepository = {
    findAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  const userRepository: IUserRepository = {
    exists: vi.fn(),
    isStaffOrTeacher: vi.fn().mockResolvedValue(true),
    isStaff: vi.fn(),
    getUserCategories: vi.fn(),
    findUserIdByMicrosoftAccount: vi.fn(),
    getDeletionStatus: vi.fn(),
    createUserWithMicrosoftLink: vi.fn(),
    updateUser: vi.fn(),
    linkMicrosoftAccount: vi.fn(),
    markAsDeleted: vi.fn(),
  };
  return {
    userSearchRepository,
    userRepository,
    service: createUserSearchService(userSearchRepository, userRepository),
  };
}

describe('UserSearchService', () => {
  it('staffまたはteacherに検索権限を与える', async () => {
    const { service, userRepository } = setup();

    await expect(service.canSearchUsers(10)).resolves.toBe(true);
    expect(userRepository.isStaffOrTeacher).toHaveBeenCalledWith(10);
  });

  it('検索条件をRepositoryへ渡す', async () => {
    const { service, userSearchRepository } = setup();
    const filter = {
      q: '田中',
      category: 'student' as const,
      status: 'inactive' as const,
      limit: 20,
      offset: 10,
    };

    await expect(service.searchUsers(filter)).resolves.toEqual({
      items: [],
      total: 0,
      limit: 20,
      offset: 10,
    });

    expect(userSearchRepository.findAll).toHaveBeenCalledWith({
      q: '田中',
      category: 'student',
      status: 'inactive',
      limit: 20,
      offset: 10,
    });
  });
});
