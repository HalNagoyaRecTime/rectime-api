import { describe, expect, it, vi } from 'vitest';
import { createClassService } from '../../../src/application/services/ClassService';
import type { IClassRepository } from '../../../src/domain/interfaces/repositories/IClassRepository';

function repository(): IClassRepository {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    teacherExists: vi.fn(),
    hasStudents: vi.fn(),
  };
}

describe('ClassService', () => {
  it('一覧をページ情報付きで返す', async () => {
    const repo = repository();
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      classes: [
        {
          class_room_id: 1,
          class_code: '11A',
          name: '1年A組',
          student_count: 2,
          teacher: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    await expect(
      createClassService(repo).getAllClasses(1, 20)
    ).resolves.toEqual({
      classes: [
        {
          class_room_id: 1,
          class_code: '11A',
          name: '1年A組',
          student_count: 2,
          teacher: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
      total_pages: 1,
    });
  });

  it('存在しない担任は登録前に404用エラーにする', async () => {
    const repo = repository();
    (repo.teacherExists as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    await expect(
      createClassService(repo).createClass({
        class_code: '11A',
        name: '1年A組',
        teacher_id: 1,
      })
    ).rejects.toThrow('Teacher not found');
  });
});
