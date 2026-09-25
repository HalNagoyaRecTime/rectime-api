import { describe, expect, it, vi } from 'vitest';
import { createClassRoomService } from '../../../src/application/services/ClassRoomService';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';
import type { ITeamRepository } from '../../../src/domain/interfaces/repositories/ITeamRepository';
import type { ITeacherRepository } from '../../../src/domain/interfaces/repositories/ITeacherRepository';

function repository(): IClassRoomRepository {
  return {
    findAll: vi.fn(),
    findById: vi.fn(),
    findByCode: vi.fn().mockResolvedValue(null),
    findExistingClassRoomIds: vi.fn(),
    findExistingClassCodes: vi.fn().mockResolvedValue(new Set()),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateAndCleanupTeam: vi.fn(),
    delete: vi.fn(),
    deleteAndCleanupTeam: vi.fn(),
    teacherExists: vi.fn(),
    existsWithTeamId: vi.fn().mockResolvedValue(false),
    hasStudents: vi.fn(),
  };
}

function teamRepository(): ITeamRepository {
  return {
    findRanking: vi.fn(),
    findAllTeams: vi.fn(),
    findTeamById: vi.fn(),
    exists: vi.fn(),
    existsClassCodes: vi.fn(),
    findClassRoomsOwnedByOtherTeam: vi.fn().mockResolvedValue([]),
    createTeam: vi.fn(),
    updateTeam: vi.fn(),
    delete: vi.fn(),
    addScore: vi.fn(),
  };
}

function teacherRepository(
  overrides: Partial<ITeacherRepository> = {}
): ITeacherRepository {
  return {
    findById: vi.fn(),
    findAll: vi.fn(),
    existsById: vi.fn().mockResolvedValue(true),
    findExistingEmails: vi.fn().mockResolvedValue(new Set<string>()),
    findMicrosoftLinkCandidateByEmail: vi.fn().mockResolvedValue(null),
    existsClassRooms: vi.fn().mockResolvedValue(true),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    deleteByUserId: vi.fn(),
    ...overrides,
  };
}

describe('ClassRoomService', () => {
  it('一覧をlimitとoffset付きで返す', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.findAll as ReturnType<typeof vi.fn>).mockResolvedValue({
      items: [
        {
          classRoomId: 1,
          classCode: 'IA14A',
          className: '高度情報学科AI開発先行コース',
          studentCount: 2,
          teacher: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });

    await expect(
      createClassRoomService(repo, teacherRepository(), team).getAllClassRooms({
        limit: 20,
        offset: 0,
      })
    ).resolves.toEqual({
      items: [
        {
          class_room_id: 1,
          class_code: 'IA14A',
          class_name: '高度情報学科AI開発先行コース',
          student_count: 2,
          teacher: null,
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    });
  });

  it('存在しない担任は登録前に404用エラーにする', async () => {
    const repo = repository();
    const team = teamRepository();
    const teachers = teacherRepository({
      existsById: vi.fn().mockResolvedValue(false),
    });

    await expect(
      createClassRoomService(repo, teachers, team).createClassRoom({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: 1,
      })
    ).rejects.toThrow('Teacher not found');
  });

  it('存在する担任を指定してクラスを登録できる', async () => {
    const repo = repository();
    const team = teamRepository();
    const input = {
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      teacherId: 1,
    };
    const classroom = {
      classRoomId: 1,
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      studentCount: 0,
      teacher: { teacherId: 1, userId: 10, displayName: '担任教員' },
    };
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(classroom);

    await expect(
      createClassRoomService(repo, teacherRepository(), team).createClassRoom(
        input
      )
    ).resolves.toEqual({
      class_room_id: 1,
      class_code: 'IA14A',
      class_name: '高度情報学科AI開発先行コース',
      student_count: 0,
      teacher: {
        teacher_id: 1,
        user_id: 10,
        display_name: '担任教員',
      },
    });
    expect(repo.create).toHaveBeenCalledWith({ ...input, teamId: null });
  });

  it('存在しないteam_idは登録前に404用エラーにする', async () => {
    const repo = repository();
    const team = teamRepository();
    (team.exists as ReturnType<typeof vi.fn>).mockResolvedValue(false);

    await expect(
      createClassRoomService(repo, teacherRepository(), team).createClassRoom({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: null,
        teamId: 999,
      })
    ).rejects.toThrow('Team not found');
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('既存のteam_idを指定した場合はそのままRepositoryへ渡す（新規team作成の判断はしない）', async () => {
    const repo = repository();
    const team = teamRepository();
    (team.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    const classroom = {
      classRoomId: 2,
      classCode: '16B',
      className: '6年Bクラス（合同）',
      studentCount: 0,
      teacher: null,
      teamId: 5,
    };
    (repo.create as ReturnType<typeof vi.fn>).mockResolvedValue(classroom);

    await expect(
      createClassRoomService(repo, teacherRepository(), team).createClassRoom({
        classCode: '16B',
        className: '6年Bクラス（合同）',
        teacherId: null,
        teamId: 5,
      })
    ).resolves.toEqual({
      class_room_id: 2,
      class_code: '16B',
      class_name: '6年Bクラス（合同）',
      student_count: 0,
      teacher: null,
      team_id: 5,
    });
    expect(repo.create).toHaveBeenCalledWith({
      classCode: '16B',
      className: '6年Bクラス（合同）',
      teacherId: null,
      teamId: 5,
    });
  });

  it('クラスコード重複を409用エラーにする', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('UNIQUE constraint failed: class_rooms.class_code')
    );

    await expect(
      createClassRoomService(repo, teacherRepository(), team).createClassRoom({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: null,
      })
    ).rejects.toThrow('Class code already exists');
  });

  it('team名重複を409用エラーにする', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('UNIQUE constraint failed: teams.team_name')
    );

    await expect(
      createClassRoomService(repo, teacherRepository(), team).createClassRoom({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: null,
      })
    ).rejects.toThrow('Team name already exists');
  });

  it('存在しないクラスを更新すると404用エラーにする', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      createClassRoomService(repo, teacherRepository(), team).updateClassRoom(
        999,
        {
          classCode: 'IA14A',
          className: '高度情報学科AI開発先行コース',
          teacherId: null,
        }
      )
    ).rejects.toThrow('Class not found');
  });

  it('更新対象を先に確認し、対象が無ければteacher確認を行わない', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const teachers = teacherRepository({
      existsById: vi.fn().mockResolvedValue(false),
    });

    await expect(
      createClassRoomService(repo, teachers, team).updateClassRoom(999, {
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: 999,
      })
    ).rejects.toThrow('Class not found');
    expect(teachers.existsById).not.toHaveBeenCalled();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('team_idを変更し、移動元のteamを他のクラスが参照していなければ、更新とあわせてteamも削除する', async () => {
    const repo = repository();
    const team = teamRepository();
    (team.exists as ReturnType<typeof vi.fn>).mockResolvedValue(true);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      classRoomId: 1,
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      studentCount: 0,
      teacher: null,
      teamId: 5,
    });
    (repo.updateAndCleanupTeam as ReturnType<typeof vi.fn>).mockResolvedValue({
      classRoomId: 1,
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      studentCount: 0,
      teacher: null,
      teamId: 9,
    });

    await createClassRoomService(
      repo,
      teacherRepository(),
      team
    ).updateClassRoom(1, {
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      teacherId: null,
      teamId: 9,
    });

    expect(repo.updateAndCleanupTeam).toHaveBeenCalledWith(
      1,
      {
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        teacherId: null,
        teamId: 9,
      },
      5
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('team_idを変更しない更新では、updateAndCleanupTeamを使わずupdateを呼ぶ', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      classRoomId: 1,
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      studentCount: 0,
      teacher: null,
      teamId: 5,
    });
    (repo.update as ReturnType<typeof vi.fn>).mockResolvedValue({
      classRoomId: 1,
      classCode: 'IA14B',
      className: '高度情報学科AI開発先行コース',
      studentCount: 0,
      teacher: null,
      teamId: 5,
    });

    await createClassRoomService(
      repo,
      teacherRepository(),
      team
    ).updateClassRoom(1, {
      classCode: 'IA14B',
      className: '高度情報学科AI開発先行コース',
      teacherId: null,
    });

    expect(repo.updateAndCleanupTeam).not.toHaveBeenCalled();
    expect(repo.update).toHaveBeenCalled();
  });

  it('学生が所属するクラスの削除を拒否する', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(true);

    await expect(
      createClassRoomService(repo, teacherRepository(), team).deleteClassRoom(1)
    ).rejects.toThrow('Class is referenced by students');
    expect(repo.deleteAndCleanupTeam).not.toHaveBeenCalled();
  });

  it('存在しないクラスの削除を404用エラーにする', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(
      createClassRoomService(repo, teacherRepository(), team).deleteClassRoom(
        999
      )
    ).rejects.toThrow('Class not found');
    expect(repo.deleteAndCleanupTeam).not.toHaveBeenCalled();
  });

  it('クラス削除とteamの後始末を1回の呼び出しにまとめて行う', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      classRoomId: 1,
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      studentCount: 0,
      teacher: null,
      teamId: 5,
    });
    (repo.deleteAndCleanupTeam as ReturnType<typeof vi.fn>).mockResolvedValue(
      true
    );

    await createClassRoomService(
      repo,
      teacherRepository(),
      team
    ).deleteClassRoom(1);

    expect(repo.deleteAndCleanupTeam).toHaveBeenCalledWith(1, 5);
    expect(repo.delete).not.toHaveBeenCalled();
    expect(repo.existsWithTeamId).not.toHaveBeenCalled();
    expect(team.delete).not.toHaveBeenCalled();
  });

  it('deleteAndCleanupTeamがクラス未削除を返した場合は404用エラーにする', async () => {
    const repo = repository();
    const team = teamRepository();
    (repo.hasStudents as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    (repo.findById as ReturnType<typeof vi.fn>).mockResolvedValue({
      classRoomId: 1,
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
      studentCount: 0,
      teacher: null,
      teamId: 5,
    });
    (repo.deleteAndCleanupTeam as ReturnType<typeof vi.fn>).mockResolvedValue(
      false
    );

    await expect(
      createClassRoomService(repo, teacherRepository(), team).deleteClassRoom(1)
    ).rejects.toThrow('Class not found');
  });

  describe('validateClassRoomImport', () => {
    it('全行が有効な場合はerrorsが空になり、DBへの書き込みは行わない', async () => {
      const repo = repository();
      const team = teamRepository();
      const service = createClassRoomService(repo, teacherRepository(), team);

      const result = await service.validateClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13D', class_name: '3年Dクラス' },
        ],
      });

      expect(result).toEqual({
        total: 2,
        success_count: 2,
        error_count: 0,
        errors: [],
      });
      expect(repo.createMany).not.toHaveBeenCalled();
    });

    it('既存DBとクラス記号が重複する行はエラーとして報告する', async () => {
      const repo = repository();
      const team = teamRepository();
      (
        repo.findExistingClassCodes as ReturnType<typeof vi.fn>
      ).mockResolvedValue(new Set(['13C']));
      const service = createClassRoomService(repo, teacherRepository(), team);

      const result = await service.validateClassRoomImport({
        rows: [{ class_code: '13C', class_name: '3年Cクラス(重複)' }],
      });

      expect(result).toEqual({
        total: 1,
        success_count: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 1,
            reason: 'class_code_duplicate_in_db',
          }),
        ],
      });
    });

    it('ファイル内でクラス記号が重複する行はエラーとして報告する', async () => {
      const repo = repository();
      const team = teamRepository();
      const service = createClassRoomService(repo, teacherRepository(), team);

      const result = await service.validateClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13C', class_name: '3年Cクラス(重複)' },
        ],
      });

      expect(result.success_count).toBe(1);
      expect(result.errors).toEqual([
        expect.objectContaining({
          row_index: 2,
          reason: 'class_code_duplicate_in_file',
        }),
      ]);
    });

    it('2,000件の検査でも、既存クラスコードの問い合わせは1回にまとめる(D1のクエリ数上限対策)', async () => {
      const repo = repository();
      const team = teamRepository();
      const service = createClassRoomService(repo, teacherRepository(), team);

      const rows = Array.from({ length: 2000 }, (_, i) => ({
        class_code: `C${i}`,
        class_name: `クラス${i}`,
      }));

      const result = await service.validateClassRoomImport({ rows });

      expect(result).toEqual({
        total: 2000,
        success_count: 2000,
        error_count: 0,
        errors: [],
      });
      const findExistingClassCodes = repo.findExistingClassCodes as ReturnType<
        typeof vi.fn
      >;
      expect(findExistingClassCodes).toHaveBeenCalledTimes(1);
      expect(findExistingClassCodes.mock.calls[0][0]).toHaveLength(2000);
    });
  });

  describe('commitClassRoomImport', () => {
    it('全行が有効な場合は全件分をまとめてcreateManyに渡す', async () => {
      const repo = repository();
      const team = teamRepository();
      const service = createClassRoomService(repo, teacherRepository(), team);

      const result = await service.commitClassRoomImport({
        rows: [
          { class_code: '13C', class_name: '3年Cクラス' },
          { class_code: '13D', class_name: '3年Dクラス' },
        ],
      });

      expect(result).toEqual({
        total: 2,
        imported: 2,
        error_count: 0,
        errors: [],
      });
      expect(repo.createMany).toHaveBeenCalledTimes(1);
      expect(repo.createMany).toHaveBeenCalledWith([
        { classCode: '13C', className: '3年Cクラス', teacherId: null },
        { classCode: '13D', className: '3年Dクラス', teacherId: null },
      ]);
    });

    it('クラス記号が重複する行がある場合は1件も登録しない', async () => {
      const repo = repository();
      const team = teamRepository();
      (
        repo.findExistingClassCodes as ReturnType<typeof vi.fn>
      ).mockResolvedValue(new Set(['13C']));
      const service = createClassRoomService(repo, teacherRepository(), team);

      const result = await service.commitClassRoomImport({
        rows: [{ class_code: '13C', class_name: '3年Cクラス(重複)' }],
      });

      expect(result).toEqual({
        total: 1,
        imported: 0,
        error_count: 1,
        errors: [
          expect.objectContaining({
            row_index: 1,
            reason: 'class_code_duplicate_in_db',
          }),
        ],
      });
      expect(repo.createMany).not.toHaveBeenCalled();
    });
  });
});
