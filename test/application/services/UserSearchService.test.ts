import { describe, expect, it, vi } from 'vitest';
import { createUserSearchService } from '../../../src/application/services/UserSearchService';
import type { IUserSearchRepository } from '../../../src/domain/interfaces/repositories/IUserSearchRepository';

function setup() {
  const userSearchRepository: IUserSearchRepository = {
    findAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  return {
    userSearchRepository,
    service: createUserSearchService(userSearchRepository),
  };
}

describe('UserSearchService', () => {
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
