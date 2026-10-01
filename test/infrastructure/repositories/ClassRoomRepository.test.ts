import { drizzle } from 'drizzle-orm/d1';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { createClassRoomRepository } from '../../../src/infrastructure/repositories/ClassRoomRepository';
import type { IClassRoomRepository } from '../../../src/domain/interfaces/repositories/IClassRoomRepository';
import * as schema from '../../../src/infrastructure/database/schema';
import {
  class_rooms,
  students,
  teachers,
  users,
} from '../../../src/infrastructure/database/schema';
import { insertClassRoomWithTeam } from '../../fixtures/classRooms';

describe('ClassRoomRepository', () => {
  let repo: IClassRoomRepository;

  beforeAll(async () => {
    const orm = drizzle(env.DB, { schema });
    // class_rooms は students から、students は users から参照されるため、
    // 参照される側を残したまま削除するとFK制約に違反する。子テーブルから順に削除する
    // （テストはストレージを他ファイルと共有するため、他ファイルが投入した行が残っている場合がある）
    await env.DB.prepare('DELETE FROM gathering_group_members').run();
    await env.DB.prepare('DELETE FROM notification_schedules').run();
    await env.DB.prepare('DELETE FROM gatherings').run();
    await env.DB.prepare('DELETE FROM events').run();
    await orm.delete(students);
    await orm.delete(teachers);
    await orm.delete(users);
    await orm.delete(class_rooms);
    await env.DB.prepare('DELETE FROM team_scores').run();
    await env.DB.prepare('DELETE FROM teams').run();
    const [teacherUser] = await orm
      .insert(users)
      .values({ userName: '担任教員' })
      .returning();
    const [teacher] = await orm
      .insert(teachers)
      .values({ userId: teacherUser.id, email: 'tannin@example.ac.jp' })
      .returning();
    const classroom1 = await insertClassRoomWithTeam(env.DB, {
      classCode: '12B',
      className: '2年Bクラス',
      teacherId: teacher.id,
    });
    await insertClassRoomWithTeam(env.DB, {
      classCode: 'IA14A',
      className: '高度情報学科AI開発先行コース',
    });
    const [studentUser] = await orm
      .insert(users)
      .values({ userName: '所属学生' })
      .returning();
    await orm.insert(students).values({
      userId: studentUser.id,
      classRoomId: classroom1.classRoomId,
      attendanceNumber: 1,
      studentIdNumber: 'CLASS-TEST-001',
    });

    repo = createClassRoomRepository(env.DB);
  });

  describe('findAll', () => {
    it('class_rooms を classRoomId 昇順で返し、limitとoffsetを適用する', async () => {
      const result = await repo.findAll({ limit: 1, offset: 1 });

      expect(result.items).toHaveLength(1);
      expect(result).toMatchObject({ total: 2, limit: 1, offset: 1 });
      expect(result.items[0].classCode).toBe('IA14A');
      const ids = result.items.map(c => c.classRoomId);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('学生数と担任をClassEntityへマッピングする', async () => {
      const result = await repo.findAll({ limit: 20, offset: 0 });

      expect(result.items[0]).toMatchObject({
        classCode: '12B',
        className: '2年Bクラス',
        studentCount: 1,
        teacher: { displayName: '担任教員' },
      });
      expect(result.items[1]).toMatchObject({
        classCode: 'IA14A',
        className: '高度情報学科AI開発先行コース',
        studentCount: 0,
        teacher: null,
      });
    });

    it('class_room_idを検索できる', async () => {
      const all = await repo.findAll({ limit: 20, offset: 0 });
      const target = all.items[0];

      const result = await repo.findAll({
        limit: 20,
        offset: 0,
        search: String(target.classRoomId),
      });

      expect(result.items.map(classroom => classroom.classRoomId)).toContain(
        target.classRoomId
      );
    });

    it('クラスコード・クラス名・担任名を検索できる', async () => {
      await expect(repo.findAll({ search: '12B' })).resolves.toMatchObject({
        items: [expect.objectContaining({ classCode: '12B' })],
      });
      await expect(
        repo.findAll({ search: '高度情報学科' })
      ).resolves.toMatchObject({
        items: [expect.objectContaining({ classCode: 'IA14A' })],
      });
      await expect(repo.findAll({ search: '担任教員' })).resolves.toMatchObject(
        {
          items: [expect.objectContaining({ classCode: '12B' })],
        }
      );
    });

    it.each([
      'classRoomId',
      'classCode',
      'className',
      'teacherName',
      'studentCount',
    ] as const)(
      '%sの昇順・降順とIDによる安定ソートを適用する',
      async sortBy => {
        if (sortBy === 'className') {
          await repo.create({
            classCode: 'SORT-TIE-A',
            className: '同名クラス',
            teacherId: null,
            teamId: null,
          });
          await repo.create({
            classCode: 'SORT-TIE-B',
            className: '同名クラス',
            teacherId: null,
            teamId: null,
          });
        }

        const ascItems = (
          await repo.findAll({ sortBy, sortOrder: 'asc', limit: 100 })
        ).items;
        const descItems = (
          await repo.findAll({ sortBy, sortOrder: 'desc', limit: 100 })
        ).items;
        const value = (item: (typeof ascItems)[number]) => {
          if (sortBy === 'classRoomId') return item.classRoomId;
          if (sortBy === 'classCode') return item.classCode;
          if (sortBy === 'className') return item.className;
          if (sortBy === 'studentCount') return item.studentCount;
          return item.teacher?.displayName ?? null;
        };
        const assertOrdered = (
          items: typeof ascItems,
          direction: 'asc' | 'desc'
        ) => {
          for (let index = 1; index < items.length; index += 1) {
            const previous = value(items[index - 1]);
            const current = value(items[index]);
            if (previous === null || current === null) continue;
            if (previous === current) {
              expect(items[index - 1].classRoomId).toBeLessThan(
                items[index].classRoomId
              );
              continue;
            }
            if (direction === 'asc') {
              expect(previous <= current).toBe(true);
            } else {
              expect(previous >= current).toBe(true);
            }
          }
        };

        assertOrdered(ascItems, 'asc');
        assertOrdered(descItems, 'desc');
      }
    );
  });

  it('詳細を取得できる', async () => {
    const classroom = (await repo.findAll({ limit: 1, offset: 0 })).items[0];

    await expect(repo.findById(classroom.classRoomId)).resolves.toMatchObject({
      classCode: '12B',
      studentCount: 1,
    });
    await expect(repo.findById(999999)).resolves.toBeNull();
  });

  it('担任未設定のクラスを作成・更新・削除できる', async () => {
    const created = await repo.create({
      classCode: '13A',
      className: '3年Aクラス',
      teacherId: null,
      teamId: null,
    });
    expect(created).toMatchObject({
      classCode: '13A',
      className: '3年Aクラス',
      studentCount: 0,
      teacher: null,
    });

    const updated = await repo.update(created.classRoomId, {
      classCode: '13B',
      className: '3年Bクラス',
      teacherId: null,
      teamId: null,
    });
    expect(updated).toMatchObject({
      classCode: '13B',
      className: '3年Bクラス',
    });
    await expect(repo.delete(created.classRoomId)).resolves.toBe(true);
    await expect(repo.findById(created.classRoomId)).resolves.toBeNull();
  });

  it('既存のteam_idを指定して作成すると、そのteamをそのまま使い新規teamを作らない', async () => {
    const base = await repo.create({
      classCode: '16A',
      className: '6年Aクラス',
      teacherId: null,
      teamId: null,
    });

    const joined = await repo.create({
      classCode: '16B',
      className: '6年Bクラス（合同）',
      teacherId: null,
      teamId: base.teamId,
    });

    expect(joined.teamId).toBe(base.teamId);
  });

  it('deleteはclass_roomの行だけを削除し、teamの削除有無は判断しない（判断はApplication層の責務）', async () => {
    const base = await repo.create({
      classCode: '17A',
      className: '7年Aクラス',
      teacherId: null,
      teamId: null,
    });
    const joined = await repo.create({
      classCode: '17B',
      className: '7年Bクラス（合同）',
      teacherId: null,
      teamId: base.teamId,
    });

    await expect(repo.delete(joined.classRoomId)).resolves.toBe(true);
    await expect(repo.findById(base.classRoomId)).resolves.toMatchObject({
      teamId: base.teamId,
    });

    // 他のclass_roomがまだ参照していてもいなくても、deleteはteamに手を出さない。
    const teamRow = await env.DB.prepare(
      'SELECT team_id FROM teams WHERE team_id = ?'
    )
      .bind(base.teamId)
      .first();
    expect(teamRow).not.toBeNull();

    await expect(repo.delete(base.classRoomId)).resolves.toBe(true);
    const teamRowAfterLastDelete = await env.DB.prepare(
      'SELECT team_id FROM teams WHERE team_id = ?'
    )
      .bind(base.teamId)
      .first();
    expect(teamRowAfterLastDelete).not.toBeNull();
  });

  describe('existsWithTeamId', () => {
    it('他のclass_roomが同じteamを参照していればtrueを返す', async () => {
      const base = await repo.create({
        classCode: '18A',
        className: '8年Aクラス',
        teacherId: null,
        teamId: null,
      });
      const joined = await repo.create({
        classCode: '18B',
        className: '8年Bクラス（合同）',
        teacherId: null,
        teamId: base.teamId,
      });

      await expect(
        repo.existsWithTeamId(base.teamId, joined.classRoomId)
      ).resolves.toBe(true);
    });

    it('自分自身しか参照していなければfalseを返す（excludeで自分自身を除外する）', async () => {
      const base = await repo.create({
        classCode: '19A',
        className: '9年Aクラス',
        teacherId: null,
        teamId: null,
      });

      await expect(
        repo.existsWithTeamId(base.teamId, base.classRoomId)
      ).resolves.toBe(false);
    });
  });

  describe('deleteAndCleanupTeam', () => {
    it('他のclass_roomがteamを参照していなければ、クラス削除とあわせてteamも削除する', async () => {
      const base = await repo.create({
        classCode: '21A',
        className: '1年Aクラス',
        teacherId: null,
        teamId: null,
      });

      await expect(
        repo.deleteAndCleanupTeam(base.classRoomId, base.teamId)
      ).resolves.toBe(true);

      await expect(repo.findById(base.classRoomId)).resolves.toBeNull();
      const teamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.teamId)
        .first();
      expect(teamRow).toBeNull();
    });

    it('他のclass_roomがteamを参照していれば、クラス削除だけ行いteamは残す', async () => {
      const base = await repo.create({
        classCode: '21B',
        className: '1年Bクラス',
        teacherId: null,
        teamId: null,
      });
      const joined = await repo.create({
        classCode: '21C',
        className: '1年Cクラス（合同）',
        teacherId: null,
        teamId: base.teamId,
      });

      await expect(
        repo.deleteAndCleanupTeam(joined.classRoomId, base.teamId)
      ).resolves.toBe(true);

      const teamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.teamId)
        .first();
      expect(teamRow).not.toBeNull();
    });

    it('存在しないclass_room_idの場合はfalseを返す', async () => {
      await expect(repo.deleteAndCleanupTeam(999999, 999999)).resolves.toBe(
        false
      );
    });

    it('team_scoresが残っていれば、他のclass_roomがなくてもteamは残す', async () => {
      const base = await repo.create({
        classCode: '21D',
        className: '1年Dクラス',
        teacherId: null,
        teamId: null,
      });
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, 10)'
      )
        .bind(base.teamId)
        .run();

      await expect(
        repo.deleteAndCleanupTeam(base.classRoomId, base.teamId)
      ).resolves.toBe(true);

      await expect(repo.findById(base.classRoomId)).resolves.toBeNull();
      const teamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.teamId)
        .first();
      expect(teamRow).not.toBeNull();

      // team_scoresを残したteamはCLEANUP_EMPTY_TEAM_SQLでは消えないため、
      // 他ファイルの無条件DELETE FROM teamsがFK違反で壊れないよう明示的に後始末する。
      await env.DB.prepare('DELETE FROM team_scores WHERE team_id = ?')
        .bind(base.teamId)
        .run();
      await env.DB.prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(base.teamId)
        .run();
    });

    it('team_scoresの行があっても得点が0ならteamを削除する', async () => {
      const base = await repo.create({
        classCode: '21E',
        className: '1年Eクラス',
        teacherId: null,
        teamId: null,
      });
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, 0)'
      )
        .bind(base.teamId)
        .run();

      await expect(
        repo.deleteAndCleanupTeam(base.classRoomId, base.teamId)
      ).resolves.toBe(true);

      const teamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.teamId)
        .first();
      expect(teamRow).toBeNull();
    });
  });

  describe('updateAndCleanupTeam', () => {
    it('team_idを変更し、移動元teamに他のclass_roomがなければ移動元teamも削除する', async () => {
      const base = await repo.create({
        classCode: '22A',
        className: '2年Aクラス',
        teacherId: null,
        teamId: null,
      });
      const destination = await repo.create({
        classCode: '22B',
        className: '2年Bクラス',
        teacherId: null,
        teamId: null,
      });

      const updated = await repo.updateAndCleanupTeam(
        base.classRoomId,
        {
          classCode: base.classCode,
          className: base.className,
          teacherId: null,
          teamId: destination.teamId,
        },
        base.teamId
      );

      expect(updated?.teamId).toBe(destination.teamId);
      const oldTeamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.teamId)
        .first();
      expect(oldTeamRow).toBeNull();
    });

    it('移動元teamに他のclass_roomが残っていれば、移動元teamは削除しない', async () => {
      const base = await repo.create({
        classCode: '22C',
        className: '2年Cクラス',
        teacherId: null,
        teamId: null,
      });
      const sibling = await repo.create({
        classCode: '22D',
        className: '2年Dクラス（合同）',
        teacherId: null,
        teamId: base.teamId,
      });
      const destination = await repo.create({
        classCode: '22E',
        className: '2年Eクラス',
        teacherId: null,
        teamId: null,
      });

      await repo.updateAndCleanupTeam(
        base.classRoomId,
        {
          classCode: base.classCode,
          className: base.className,
          teacherId: null,
          teamId: destination.teamId,
        },
        base.teamId
      );

      const oldTeamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.teamId)
        .first();
      expect(oldTeamRow).not.toBeNull();
      await expect(repo.findById(sibling.classRoomId)).resolves.toMatchObject({
        teamId: base.teamId,
      });
    });

    it('移動元teamにteam_scoresが残っていれば、他のclass_roomがなくても移動元teamは削除しない', async () => {
      const base = await repo.create({
        classCode: '22F',
        className: '2年Fクラス',
        teacherId: null,
        teamId: null,
      });
      const destination = await repo.create({
        classCode: '22G',
        className: '2年Gクラス',
        teacherId: null,
        teamId: null,
      });
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, 10)'
      )
        .bind(base.teamId)
        .run();

      const updated = await repo.updateAndCleanupTeam(
        base.classRoomId,
        {
          classCode: base.classCode,
          className: base.className,
          teacherId: null,
          teamId: destination.teamId,
        },
        base.teamId
      );

      expect(updated?.teamId).toBe(destination.teamId);
      const oldTeamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.teamId)
        .first();
      expect(oldTeamRow).not.toBeNull();

      // team_scoresを残したteamはCLEANUP_EMPTY_TEAM_SQLでは消えないため、
      // 他ファイルの無条件DELETE FROM teamsがFK違反で壊れないよう明示的に後始末する。
      await env.DB.prepare('DELETE FROM team_scores WHERE team_id = ?')
        .bind(base.teamId)
        .run();
      await env.DB.prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(base.teamId)
        .run();
    });
  });

  it('class_codeの一意制約を適用する', async () => {
    await expect(
      repo.create({
        classCode: 'IA14A',
        className: '重複クラス',
        teacherId: null,
        teamId: null,
      })
    ).rejects.toThrow(/UNIQUE/);
  });

  it('class_codeの一意制約を更新にも適用する', async () => {
    const target = await repo.findByCode('12B');
    expect(target).not.toBeNull();

    await expect(
      repo.update(target!.classRoomId, {
        classCode: 'IA14A',
        className: '重複クラス',
        teacherId: null,
        teamId: null,
      })
    ).rejects.toThrow(/UNIQUE/);

    await expect(repo.findByCode('12B')).resolves.toMatchObject({
      className: '2年Bクラス',
    });
  });

  it('学生の所属有無を返す', async () => {
    const classrooms = (await repo.findAll({ limit: 20, offset: 0 })).items;
    const assigned = classrooms.find(c => c.classCode === '12B');
    const unassigned = classrooms.find(c => c.classCode === 'IA14A');

    await expect(repo.hasStudents(assigned!.classRoomId)).resolves.toBe(true);
    await expect(repo.hasStudents(unassigned!.classRoomId)).resolves.toBe(
      false
    );
  });

  describe('findByCode', () => {
    it('class_codeでクラスを取得できる', async () => {
      await expect(repo.findByCode('IA14A')).resolves.toMatchObject({
        classCode: 'IA14A',
      });
    });

    it('存在しないclass_codeの場合はnullを返す', async () => {
      await expect(repo.findByCode('NOPE')).resolves.toBeNull();
    });
  });

  describe('findExistingClassCodes', () => {
    it('2,000件の候補から、DBに実在するクラスコードだけをチャンク境界をまたいでもまとめて返す', async () => {
      const candidates = Array.from(
        { length: 2000 },
        (_, i) => `Z${String(i).padStart(4, '0')}`
      );
      candidates[0] = '12B';
      candidates[150] = 'IA14A';

      const existing = await repo.findExistingClassCodes(candidates);

      expect(existing).toEqual(new Set(['12B', 'IA14A']));
    });

    it('候補が空配列の場合は空集合を返す', async () => {
      expect(await repo.findExistingClassCodes([])).toEqual(new Set());
    });
  });

  describe('findExistingClassRoomIds', () => {
    it('候補からDBに実在するクラスIDだけを返す', async () => {
      const ids = (await repo.findAll({ limit: 20, offset: 0 })).items.map(
        classroom => classroom.classRoomId
      );
      const candidates = Array.from(
        { length: 2000 },
        (_, index) => index + 1000
      );
      candidates[0] = ids[0];
      candidates[150] = ids[1];

      await expect(repo.findExistingClassRoomIds(candidates)).resolves.toEqual(
        new Set([ids[0], ids[1]])
      );
    });

    it('候補が空配列の場合は空集合を返す', async () => {
      await expect(repo.findExistingClassRoomIds([])).resolves.toEqual(
        new Set()
      );
    });
  });

  describe('createMany', () => {
    it('複数のクラスをまとめて作成する', async () => {
      await repo.createMany([
        { classCode: '14D', className: '4年Dクラス', teacherId: null },
        { classCode: '14E', className: '4年Eクラス', teacherId: null },
      ]);

      await expect(repo.findByCode('14D')).resolves.toMatchObject({
        className: '4年Dクラス',
      });
      await expect(repo.findByCode('14E')).resolves.toMatchObject({
        className: '4年Eクラス',
      });
    });

    it('空配列の場合は何も作成しない', async () => {
      const before = (await repo.findAll({ limit: 100, offset: 0 })).total;
      await repo.createMany([]);
      const after = (await repo.findAll({ limit: 100, offset: 0 })).total;
      expect(after).toBe(before);
    });

    it('class_codeが重複する行がある場合は1件も登録しない', async () => {
      await expect(
        repo.createMany([
          { classCode: '15A', className: '5年Aクラス', teacherId: null },
          { classCode: 'IA14A', className: '重複クラス', teacherId: null },
        ])
      ).rejects.toThrow();

      await expect(repo.findByCode('15A')).resolves.toBeNull();
    });

    it('class_codeが重複する行がある場合、作成しかけたteamも残らない（team挿入とclass_rooms挿入は同一トランザクション）', async () => {
      const before = await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM teams'
      ).first<{ total: number }>();

      await expect(
        repo.createMany([
          {
            classCode: '15C',
            className: '孤立チーム確認クラス',
            teacherId: null,
          },
          {
            classCode: 'IA14A',
            className: '重複クラス',
            teacherId: null,
          },
        ])
      ).rejects.toThrow();

      const after = await env.DB.prepare(
        'SELECT COUNT(*) AS total FROM teams'
      ).first<{ total: number }>();
      expect(after?.total).toBe(before?.total);

      const orphanedTeam = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_name = ?'
      )
        .bind('孤立チーム確認クラス(15C)')
        .first();
      expect(orphanedTeam).toBeNull();
    });

    it('クラス名が重複する行があっても作成できる（暫定チーム名はクラスコードで一意化される）', async () => {
      await repo.createMany([
        {
          classCode: '20A',
          className: '重複組',
          teacherId: null,
        },
        {
          classCode: '20B',
          className: '重複組',
          teacherId: null,
        },
      ]);

      const created20A = await repo.findByCode('20A');
      const created20B = await repo.findByCode('20B');
      expect(created20A?.className).toBe('重複組');
      expect(created20B?.className).toBe('重複組');
      expect(created20A?.teamId).not.toBe(created20B?.teamId);
    });

    it('後続チャンクの重複エラーでも先行チャンクを残さない', async () => {
      const inputs = Array.from({ length: 34 }, (_, index) => ({
        classCode: `ATOMIC-${index}`,
        className: `原子性テスト${index}`,
        teacherId: null,
      }));
      inputs[33] = {
        classCode: 'IA14A',
        className: '重複クラス',
        teacherId: null,
      };

      await expect(repo.createMany(inputs)).rejects.toThrow();
      await expect(repo.findByCode('ATOMIC-0')).resolves.toBeNull();
    });

    it('2,000件のクラスをまとめて作成できる', async () => {
      const inputs = Array.from({ length: 2000 }, (_, i) => ({
        classCode: `BULK2K-${i}`,
        className: `一括クラス${i}`,
        teacherId: null,
      }));

      await repo.createMany(inputs);

      await expect(repo.findByCode('BULK2K-0')).resolves.toMatchObject({
        className: '一括クラス0',
      });
      await expect(repo.findByCode('BULK2K-1999')).resolves.toMatchObject({
        className: '一括クラス1999',
      });
    }, 15000);

    it('db.batch()の呼び出しがチャンク分割された場合、後のチャンクが失敗すると先に確定した分もまとめて後片付けされる', async () => {
      const CHUNK_SIZE = 20; // Math.floor(D1_MAX_BOUND_PARAMETERS / 5)と同じ値
      const firstChunkInputs = Array.from({ length: CHUNK_SIZE }, (_, i) => ({
        classCode: `CROSS-CHUNK-${i}`,
        className: `チャンク跨ぎクラス${i}`,
        teacherId: null,
      }));
      const secondChunkInputs = [
        {
          // 既存のclass_codeにぶつけて2チャンク目を失敗させる
          classCode: 'IA14A',
          className: '2チャンク目で重複するクラス',
          teacherId: null,
        },
      ];

      await expect(
        repo.createMany([...firstChunkInputs, ...secondChunkInputs])
      ).rejects.toThrow();

      // 1チャンク目(20件)は一度コミットされているはずだが、
      // 2チャンク目の失敗を受けてまとめて後片付けされていること
      for (const input of firstChunkInputs) {
        await expect(repo.findByCode(input.classCode)).resolves.toBeNull();
      }
      const orphanedTeams = await env.DB.prepare(
        "SELECT team_id FROM teams WHERE team_name LIKE 'チャンク跨ぎクラス%'"
      ).all();
      expect(orphanedTeams.results).toHaveLength(0);
    });
  });

  describe('担任の稼働状態', () => {
    it('無効化された教員は担任として返さないが、割り当ては残り再有効化で戻る', async () => {
      const target = (await repo.findAll({ limit: 100, offset: 0 })).items.find(
        c => c.classCode === '12B'
      );

      await env.DB.prepare(
        "UPDATE users SET is_live_active = 0 WHERE user_name = '担任教員'"
      ).run();

      await expect(repo.findById(target!.classRoomId)).resolves.toMatchObject({
        teacher: null,
      });

      // 表示から外れるだけで、担任の割り当て自体は残っている
      const row = await env.DB.prepare(
        'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(target!.classRoomId)
        .first<{ teacher_id: number | null }>();
      expect(row?.teacher_id).not.toBeNull();

      await env.DB.prepare(
        "UPDATE users SET is_live_active = 1 WHERE user_name = '担任教員'"
      ).run();

      await expect(repo.findById(target!.classRoomId)).resolves.toMatchObject({
        teacher: { displayName: '担任教員' },
      });
    });

    it('停止中の担任がいるクラスをクラス名だけ変更しても、再有効化で担任に戻る', async () => {
      const target = (await repo.findAll({ limit: 100, offset: 0 })).items.find(
        c => c.classCode === '12B'
      );

      await env.DB.prepare(
        "UPDATE users SET is_live_active = 0 WHERE user_name = '担任教員'"
      ).run();

      // 管理画面は担任なしとして受け取った教室をそのまま送り返すため、
      // クラス名だけを変えた保存でも teacherId は null で届く
      const updated = await repo.update(target!.classRoomId, {
        classCode: '12B',
        className: '2年Bクラス（改称）',
        teacherId: null,
        teamId: null,
      });
      expect(updated).toMatchObject({
        className: '2年Bクラス（改称）',
        teacher: null,
      });

      await env.DB.prepare(
        "UPDATE users SET is_live_active = 1 WHERE user_name = '担任教員'"
      ).run();

      await expect(repo.findById(target!.classRoomId)).resolves.toMatchObject({
        className: '2年Bクラス（改称）',
        teacher: { displayName: '担任教員' },
      });
    });

    it('稼働中の担任はteacherId: nullで外せる', async () => {
      const target = (await repo.findAll({ limit: 100, offset: 0 })).items.find(
        c => c.classCode === '12B'
      );

      const updated = await repo.update(target!.classRoomId, {
        classCode: '12B',
        className: '2年Bクラス',
        teacherId: null,
        teamId: null,
      });

      expect(updated).toMatchObject({ teacher: null });
      const row = await env.DB.prepare(
        'SELECT teacher_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(target!.classRoomId)
        .first<{ teacher_id: number | null }>();
      expect(row?.teacher_id).toBeNull();
    });
  });
});
