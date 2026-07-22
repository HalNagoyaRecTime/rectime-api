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

  it('存在する担任を指定してクラスを登録できる', async () => {
    const repo = repository();
    const input = { class_code: '11A', name: '1年A組', teacher_id: 1 };
    const classroom = {
      class_room_id: 1,
      class_code: '11A',
      name: '1年A組',
      student_count: 0,
      teacher: { teacher_id: 1, user_id: 10, display_name: '担任教員' },
    };
    (repo.teacherExists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(classroom);

    await expect(createClassService(repo).createClass(input)).resolves.toEqual(
      classroom
    );
    expect(repo.create).toHaveBeenCalledWith(input);
  });

  it('クラスコード重複を409用エラーにする', async () => {
    const repo = repository();
    (repo.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('UNIQUE constraint failed: class_rooms.class_code')
    );

    await expect(
      createClassService(repo).createClass({
        class_code: '11A',
        name: '1年A組',
        teacher_id: null,
      })
    ).rejects.toThrow('Class code already exists');
  });

  it('存在しないクラスを更新すると404用エラーにする', async () => {
    const repo = repository();
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      createClassService(repo).updateClass(999, {
        class_code: '11A',
        name: '1年A組',
        teacher_id: null,
      })
    ).rejects.toThrow('Class not found');
  });

  it('学生が所属するクラスの削除を拒否する', async () => {
    const repo = repository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(createClassService(repo).deleteClass(1)).rejects.toThrow(
      'Class is referenced by students'
    );
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('存在しないクラスの削除を404用エラーにする', async () => {
    const repo = repository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(createClassService(repo).deleteClass(999)).rejects.toThrow(
      'Class not found'
    );
  });

  it('学生がいないクラスを削除できる', async () => {
    const repo = repository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repo.delete as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      createClassService(repo).deleteClass(1)
    ).resolves.toBeUndefined();
    expect(repo.delete).toHaveBeenCalledWith(1);
  });
});
