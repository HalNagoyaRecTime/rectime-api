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
    await env.DB.prepare('DELETE FROM teams').run();
    const [teacherUser] = await orm
      .insert(users)
      .values({ userName: '担任教員' })
      .returning();
    const [teacher] = await orm
      .insert(teachers)
      .values({ userId: teacherUser.id })
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
    it('class_rooms を class_room_id 昇順で返し、limitとoffsetを適用する', async () => {
      const result = await repo.findAll(1, 1);

      expect(result.classrooms).toHaveLength(1);
      expect(result).toMatchObject({ total: 2, limit: 1, offset: 1 });
      expect(result.classrooms[0].class_code).toBe('IA14A');
      const ids = result.classrooms.map(c => c.class_room_id);
      expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('学生数と担任をClassEntityへマッピングする', async () => {
      const result = await repo.findAll(20, 0);

      expect(result.classrooms[0]).toMatchObject({
        class_code: '12B',
        class_name: '2年Bクラス',
        student_count: 1,
        teacher: { display_name: '担任教員' },
      });
      expect(result.classrooms[1]).toMatchObject({
        class_code: 'IA14A',
        class_name: '高度情報学科AI開発先行コース',
        student_count: 0,
        teacher: null,
      });
    });
  });

  it('詳細を取得できる', async () => {
    const classroom = (await repo.findAll(1, 0)).classrooms[0];

    await expect(repo.findById(classroom.class_room_id)).resolves.toMatchObject(
      {
        class_code: '12B',
        student_count: 1,
      }
    );
    await expect(repo.findById(999999)).resolves.toBeNull();
  });

  it('担任未設定のクラスを作成・更新・削除できる', async () => {
    const created = await repo.create({
      class_code: '13A',
      class_name: '3年Aクラス',
      teacher_id: null,
      team_id: null,
    });
    expect(created).toMatchObject({
      class_code: '13A',
      class_name: '3年Aクラス',
      student_count: 0,
      teacher: null,
    });

    const updated = await repo.update(created.class_room_id, {
      class_code: '13B',
      class_name: '3年Bクラス',
      teacher_id: null,
      team_id: null,
    });
    expect(updated).toMatchObject({
      class_code: '13B',
      class_name: '3年Bクラス',
    });
    await expect(repo.delete(created.class_room_id)).resolves.toBe(true);
    await expect(repo.findById(created.class_room_id)).resolves.toBeNull();
  });

  it('既存のteam_idを指定して作成すると、そのteamをそのまま使い新規teamを作らない', async () => {
    const base = await repo.create({
      class_code: '16A',
      class_name: '6年Aクラス',
      teacher_id: null,
      team_id: null,
    });

    const joined = await repo.create({
      class_code: '16B',
      class_name: '6年Bクラス（合同）',
      teacher_id: null,
      team_id: base.team_id,
    });

    expect(joined.team_id).toBe(base.team_id);
  });

  it('deleteはclass_roomの行だけを削除し、teamの削除有無は判断しない（判断はApplication層の責務）', async () => {
    const base = await repo.create({
      class_code: '17A',
      class_name: '7年Aクラス',
      teacher_id: null,
      team_id: null,
    });
    const joined = await repo.create({
      class_code: '17B',
      class_name: '7年Bクラス（合同）',
      teacher_id: null,
      team_id: base.team_id,
    });

    await expect(repo.delete(joined.class_room_id)).resolves.toBe(true);
    await expect(repo.findById(base.class_room_id)).resolves.toMatchObject({
      team_id: base.team_id,
    });

    // 他のclass_roomがまだ参照していてもいなくても、deleteはteamに手を出さない。
    const teamRow = await env.DB.prepare(
      'SELECT team_id FROM teams WHERE team_id = ?'
    )
      .bind(base.team_id)
      .first();
    expect(teamRow).not.toBeNull();

    await expect(repo.delete(base.class_room_id)).resolves.toBe(true);
    const teamRowAfterLastDelete = await env.DB.prepare(
      'SELECT team_id FROM teams WHERE team_id = ?'
    )
      .bind(base.team_id)
      .first();
    expect(teamRowAfterLastDelete).not.toBeNull();
  });

  describe('existsWithTeamId', () => {
    it('他のclass_roomが同じteamを参照していればtrueを返す', async () => {
      const base = await repo.create({
        class_code: '18A',
        class_name: '8年Aクラス',
        teacher_id: null,
        team_id: null,
      });
      const joined = await repo.create({
        class_code: '18B',
        class_name: '8年Bクラス（合同）',
        teacher_id: null,
        team_id: base.team_id,
      });

      await expect(
        repo.existsWithTeamId(base.team_id, joined.class_room_id)
      ).resolves.toBe(true);
    });

    it('自分自身しか参照していなければfalseを返す（excludeで自分自身を除外する）', async () => {
      const base = await repo.create({
        class_code: '19A',
        class_name: '9年Aクラス',
        teacher_id: null,
        team_id: null,
      });

      await expect(
        repo.existsWithTeamId(base.team_id, base.class_room_id)
      ).resolves.toBe(false);
    });
  });

  describe('deleteAndCleanupTeam', () => {
    it('他のclass_roomがteamを参照していなければ、クラス削除とあわせてteamも削除する', async () => {
      const base = await repo.create({
        class_code: '21A',
        class_name: '1年Aクラス',
        teacher_id: null,
        team_id: null,
      });

      await expect(
        repo.deleteAndCleanupTeam(base.class_room_id, base.team_id)
      ).resolves.toBe(true);

      await expect(repo.findById(base.class_room_id)).resolves.toBeNull();
      const teamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.team_id)
        .first();
      expect(teamRow).toBeNull();
    });

    it('他のclass_roomがteamを参照していれば、クラス削除だけ行いteamは残す', async () => {
      const base = await repo.create({
        class_code: '21B',
        class_name: '1年Bクラス',
        teacher_id: null,
        team_id: null,
      });
      const joined = await repo.create({
        class_code: '21C',
        class_name: '1年Cクラス（合同）',
        teacher_id: null,
        team_id: base.team_id,
      });

      await expect(
        repo.deleteAndCleanupTeam(joined.class_room_id, base.team_id)
      ).resolves.toBe(true);

      const teamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.team_id)
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
        class_code: '21D',
        class_name: '1年Dクラス',
        teacher_id: null,
        team_id: null,
      });
      const event = await env.DB.prepare(
        "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('体育祭', '校庭', '1000', '1200') RETURNING event_id"
      ).first<{ event_id: number }>();
      await env.DB.prepare(
        'INSERT INTO team_scores (event_id, team_id, scores) VALUES (?, ?, 10)'
      )
        .bind(event!.event_id, base.team_id)
        .run();

      await expect(
        repo.deleteAndCleanupTeam(base.class_room_id, base.team_id)
      ).resolves.toBe(true);

      await expect(repo.findById(base.class_room_id)).resolves.toBeNull();
      const teamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.team_id)
        .first();
      expect(teamRow).not.toBeNull();

      // team_scoresを残したteamはCLEANUP_TEAM_SQLでは消えないため、
      // 他ファイルの無条件DELETE FROM teamsがFK違反で壊れないよう明示的に後始末する。
      await env.DB.prepare('DELETE FROM team_scores WHERE team_id = ?')
        .bind(base.team_id)
        .run();
      await env.DB.prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(base.team_id)
        .run();
      await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
        .bind(event!.event_id)
        .run();
    });
  });

  describe('updateAndCleanupTeam', () => {
    it('team_idを変更し、移動元teamに他のclass_roomがなければ移動元teamも削除する', async () => {
      const base = await repo.create({
        class_code: '22A',
        class_name: '2年Aクラス',
        teacher_id: null,
        team_id: null,
      });
      const destination = await repo.create({
        class_code: '22B',
        class_name: '2年Bクラス',
        teacher_id: null,
        team_id: null,
      });

      const updated = await repo.updateAndCleanupTeam(
        base.class_room_id,
        {
          class_code: base.class_code,
          class_name: base.class_name,
          teacher_id: null,
          team_id: destination.team_id,
        },
        base.team_id
      );

      expect(updated?.team_id).toBe(destination.team_id);
      const oldTeamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.team_id)
        .first();
      expect(oldTeamRow).toBeNull();
    });

    it('移動元teamに他のclass_roomが残っていれば、移動元teamは削除しない', async () => {
      const base = await repo.create({
        class_code: '22C',
        class_name: '2年Cクラス',
        teacher_id: null,
        team_id: null,
      });
      const sibling = await repo.create({
        class_code: '22D',
        class_name: '2年Dクラス（合同）',
        teacher_id: null,
        team_id: base.team_id,
      });
      const destination = await repo.create({
        class_code: '22E',
        class_name: '2年Eクラス',
        teacher_id: null,
        team_id: null,
      });

      await repo.updateAndCleanupTeam(
        base.class_room_id,
        {
          class_code: base.class_code,
          class_name: base.class_name,
          teacher_id: null,
          team_id: destination.team_id,
        },
        base.team_id
      );

      const oldTeamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.team_id)
        .first();
      expect(oldTeamRow).not.toBeNull();
      await expect(repo.findById(sibling.class_room_id)).resolves.toMatchObject(
        { team_id: base.team_id }
      );
    });

    it('移動元teamにteam_scoresが残っていれば、他のclass_roomがなくても移動元teamは削除しない', async () => {
      const base = await repo.create({
        class_code: '22F',
        class_name: '2年Fクラス',
        teacher_id: null,
        team_id: null,
      });
      const destination = await repo.create({
        class_code: '22G',
        class_name: '2年Gクラス',
        teacher_id: null,
        team_id: null,
      });
      const event = await env.DB.prepare(
        "INSERT INTO events (event_name, venue, start_time, end_time) VALUES ('体育祭', '校庭', '1000', '1200') RETURNING event_id"
      ).first<{ event_id: number }>();
      await env.DB.prepare(
        'INSERT INTO team_scores (event_id, team_id, scores) VALUES (?, ?, 10)'
      )
        .bind(event!.event_id, base.team_id)
        .run();

      const updated = await repo.updateAndCleanupTeam(
        base.class_room_id,
        {
          class_code: base.class_code,
          class_name: base.class_name,
          teacher_id: null,
          team_id: destination.team_id,
        },
        base.team_id
      );

      expect(updated?.team_id).toBe(destination.team_id);
      const oldTeamRow = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(base.team_id)
        .first();
      expect(oldTeamRow).not.toBeNull();

      // team_scoresを残したteamはCLEANUP_TEAM_SQLでは消えないため、
      // 他ファイルの無条件DELETE FROM teamsがFK違反で壊れないよう明示的に後始末する。
      await env.DB.prepare('DELETE FROM team_scores WHERE team_id = ?')
        .bind(base.team_id)
        .run();
      await env.DB.prepare('DELETE FROM teams WHERE team_id = ?')
        .bind(base.team_id)
        .run();
      await env.DB.prepare('DELETE FROM events WHERE event_id = ?')
        .bind(event!.event_id)
        .run();
    });
  });

  it('class_codeの一意制約を適用する', async () => {
    await expect(
      repo.create({
        class_code: 'IA14A',
        class_name: '重複クラス',
        teacher_id: null,
        team_id: null,
      })
    ).rejects.toThrow(/UNIQUE/);
  });

  it('学生の所属有無を返す', async () => {
    const classrooms = (await repo.findAll(20, 0)).classrooms;
    const assigned = classrooms.find(c => c.class_code === '12B');
    const unassigned = classrooms.find(c => c.class_code === 'IA14A');

    await expect(repo.hasStudents(assigned!.class_room_id)).resolves.toBe(true);
    await expect(repo.hasStudents(unassigned!.class_room_id)).resolves.toBe(
      false
    );
  });

  describe('findByCode', () => {
    it('class_codeでクラスを取得できる', async () => {
      await expect(repo.findByCode('IA14A')).resolves.toMatchObject({
        class_code: 'IA14A',
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

  describe('createMany', () => {
    it('複数のクラスをまとめて作成する', async () => {
      await repo.createMany([
        {
          class_code: '14D',
          class_name: '4年Dクラス',
          teacher_id: null,
          team_id: null,
        },
        {
          class_code: '14E',
          class_name: '4年Eクラス',
          teacher_id: null,
          team_id: null,
        },
      ]);

      await expect(repo.findByCode('14D')).resolves.toMatchObject({
        class_name: '4年Dクラス',
      });
      await expect(repo.findByCode('14E')).resolves.toMatchObject({
        class_name: '4年Eクラス',
      });
    });

    it('空配列の場合は何も作成しない', async () => {
      const before = (await repo.findAll(100, 0)).total;
      await repo.createMany([]);
      const after = (await repo.findAll(100, 0)).total;
      expect(after).toBe(before);
    });

    it('class_codeが重複する行がある場合は1件も登録しない', async () => {
      await expect(
        repo.createMany([
          {
            class_code: '15A',
            class_name: '5年Aクラス',
            teacher_id: null,
            team_id: null,
          },
          {
            class_code: 'IA14A',
            class_name: '重複クラス',
            teacher_id: null,
            team_id: null,
          },
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
            class_code: '15C',
            class_name: '孤立チーム確認クラス',
            teacher_id: null,
            team_id: null,
          },
          {
            class_code: 'IA14A',
            class_name: '重複クラス',
            teacher_id: null,
            team_id: null,
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
        .bind('孤立チーム確認クラス（15C）')
        .first();
      expect(orphanedTeam).toBeNull();
    });

    it('クラス名が重複する行があっても作成できる（暫定チーム名はクラスコードで一意化される）', async () => {
      await repo.createMany([
        {
          class_code: '20A',
          class_name: '重複組',
          teacher_id: null,
          team_id: null,
        },
        {
          class_code: '20B',
          class_name: '重複組',
          teacher_id: null,
          team_id: null,
        },
      ]);

      const created20A = await repo.findByCode('20A');
      const created20B = await repo.findByCode('20B');
      expect(created20A?.class_name).toBe('重複組');
      expect(created20B?.class_name).toBe('重複組');
      expect(created20A?.team_id).not.toBe(created20B?.team_id);
    });

    it('2,000件のクラスをまとめて作成できる', async () => {
      const inputs = Array.from({ length: 2000 }, (_, i) => ({
        class_code: `BULK2K-${i}`,
        class_name: `一括クラス${i}`,
        teacher_id: null,
        team_id: null,
      }));

      await repo.createMany(inputs);

      await expect(repo.findByCode('BULK2K-0')).resolves.toMatchObject({
        class_name: '一括クラス0',
      });
      await expect(repo.findByCode('BULK2K-1999')).resolves.toMatchObject({
        class_name: '一括クラス1999',
      });
    });
  });
});
