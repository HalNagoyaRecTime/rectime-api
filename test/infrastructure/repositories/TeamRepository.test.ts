import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTeamRepository } from '../../../src/infrastructure/repositories/TeamRepository';
import type { ITeamRepository } from '../../../src/domain/interfaces/repositories/ITeamRepository';

describe('TeamRepository', () => {
  let repo: ITeamRepository;

  beforeEach(async () => {
    // students.class_room_id が class_rooms を外部キー参照しているため、
    // 他ファイルが残したstudentsが残っているとclass_roomsを先に消せない。
    await env.DB.prepare('DELETE FROM students').run();
    await env.DB.prepare('DELETE FROM class_rooms').run();
    await env.DB.prepare('DELETE FROM team_scores').run();
    await env.DB.prepare('DELETE FROM teams').run();
    repo = createTeamRepository(env.DB);
  });

  async function insertTeam(teamName: string): Promise<number> {
    const row = await env.DB.prepare(
      'INSERT INTO teams (team_name) VALUES (?) RETURNING team_id'
    )
      .bind(teamName)
      .first<{ team_id: number }>();
    return row!.team_id;
  }

  // class_rooms.team_id は NOT NULL のため、まず所属先のteamを用意してから
  // クラスを作る。
  async function insertClassRoom(
    classCode: string,
    teamId?: number
  ): Promise<number> {
    const resolvedTeamId =
      teamId ?? (await insertTeam(`placeholder(${classCode})`));
    const row = await env.DB.prepare(
      'INSERT INTO class_rooms (class_code, class_name, team_id) VALUES (?, ?, ?) RETURNING class_room_id'
    )
      .bind(classCode, `${classCode}組`, resolvedTeamId)
      .first<{ class_room_id: number }>();
    return row!.class_room_id;
  }

  describe('findRanking', () => {
    it('得点降順に並べ、同点は同順位として次の順位を人数分繰り下げる', async () => {
      const teamA = await insertTeam('チームA');
      const teamB = await insertTeam('チームB');
      const teamC = await insertTeam('チームC');
      const teamD = await insertTeam('チームD');
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, ?), (?, ?), (?, ?)'
      )
        .bind(teamA, 30, teamB, 30, teamC, 10)
        .run();
      // teamDはteam_scores行を持たない(0点扱い)

      const result = await repo.findRanking({ limit: 50, offset: 0 });

      expect(result.total).toBe(4);
      expect(result.items).toEqual([
        { rank: 1, team_id: teamA, team_name: 'チームA', scores: 30 },
        { rank: 1, team_id: teamB, team_name: 'チームB', scores: 30 },
        { rank: 3, team_id: teamC, team_name: 'チームC', scores: 10 },
        { rank: 4, team_id: teamD, team_name: 'チームD', scores: 0 },
      ]);
    });

    it('limit・offsetでページ分けできる', async () => {
      const teamA = await insertTeam('チームA');
      const teamB = await insertTeam('チームB');
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, 30), (?, 10)'
      )
        .bind(teamA, teamB)
        .run();

      const result = await repo.findRanking({ limit: 1, offset: 1 });

      expect(result.total).toBe(2);
      expect(result.items).toEqual([
        { rank: 2, team_id: teamB, team_name: 'チームB', scores: 10 },
      ]);
    });
  });

  describe('findAllTeams', () => {
    it('所属クラスをclass_code配列として、得点とあわせて返す', async () => {
      const teamId = await insertTeam('チームA');
      await insertClassRoom('1A', teamId);
      await insertClassRoom('1B', teamId);
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, 10)'
      )
        .bind(teamId)
        .run();

      const result = await repo.findAllTeams({
        limit: 50,
        offset: 0,
        sortBy: 'teamName',
        sortOrder: 'asc',
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({
        team_id: teamId,
        team_name: 'チームA',
        scores: 10,
      });
      expect(result.items[0].registered_classes.sort()).toEqual(['1A', '1B']);
    });

    it('searchでチーム名を部分一致検索できる', async () => {
      await insertTeam('赤組');
      await insertTeam('白組');

      const result = await repo.findAllTeams({
        search: '赤',
        limit: 50,
        offset: 0,
        sortBy: 'teamName',
        sortOrder: 'asc',
      });

      expect(result.total).toBe(1);
      expect(result.items[0]).toMatchObject({ team_name: '赤組' });
    });

    it('sortOrderがdescの場合は降順で返す', async () => {
      await insertTeam('チームA');
      await insertTeam('チームB');

      const result = await repo.findAllTeams({
        limit: 50,
        offset: 0,
        sortBy: 'teamName',
        sortOrder: 'desc',
      });

      expect(result.items.map(item => item.team_name)).toEqual([
        'チームB',
        'チームA',
      ]);
    });
  });

  describe('findTeamById', () => {
    it('team_scoresが無いチームは0点・空のregistered_classesとして返す', async () => {
      const teamId = await insertTeam('新規チーム');

      await expect(repo.findTeamById(teamId)).resolves.toMatchObject({
        team_id: teamId,
        team_name: '新規チーム',
        scores: 0,
        registered_classes: [],
      });
    });

    it('存在しないチームはnullを返す', async () => {
      await expect(repo.findTeamById(999999)).resolves.toBeNull();
    });
  });

  describe('exists', () => {
    it('存在するチームはtrueを返す', async () => {
      const teamId = await insertTeam('存在チーム');
      await expect(repo.exists(teamId)).resolves.toBe(true);
    });

    it('存在しないチームはfalseを返す', async () => {
      await expect(repo.exists(999999)).resolves.toBe(false);
    });
  });

  describe('existsClassCodes', () => {
    it('すべて存在する場合はtrueを返す', async () => {
      await insertClassRoom('1A');
      await insertClassRoom('1B');

      await expect(repo.existsClassCodes(['1A', '1B'])).resolves.toBe(true);
    });

    it('存在しないclass_codeが含まれる場合はfalseを返す', async () => {
      await insertClassRoom('1A');

      await expect(repo.existsClassCodes(['1A', '9Z'])).resolves.toBe(false);
    });

    it('空配列の場合はtrueを返す', async () => {
      await expect(repo.existsClassCodes([])).resolves.toBe(true);
    });
  });

  describe('findClassRoomsOwnedByOtherTeam', () => {
    it('単独編成(所属クラス1件)に属するクラスは対象にしない', async () => {
      await insertClassRoom('1A');

      await expect(
        repo.findClassRoomsOwnedByOtherTeam(['1A'])
      ).resolves.toEqual([]);
    });

    it('既に他の複数編成に属するクラスを返す', async () => {
      const otherTeamId = await insertTeam('既存チーム');
      await insertClassRoom('1A', otherTeamId);
      await insertClassRoom('1B', otherTeamId);

      const result = await repo.findClassRoomsOwnedByOtherTeam(['1A']);

      expect(result).toEqual([
        { class_code: '1A', team_id: otherTeamId, team_name: '既存チーム' },
      ]);
    });

    it('excludeTeamIdで指定したチーム自身への所属は対象にしない', async () => {
      const teamId = await insertTeam('自分のチーム');
      await insertClassRoom('1A', teamId);
      await insertClassRoom('1B', teamId);

      await expect(
        repo.findClassRoomsOwnedByOtherTeam(['1A'], teamId)
      ).resolves.toEqual([]);
    });
  });

  describe('createTeam', () => {
    it('class_codesで指定したクラスを新しいチームへ付け替える', async () => {
      const classRoomId = await insertClassRoom('1A');

      const created = await repo.createTeam({
        team_name: '新設チーム',
        class_codes: ['1A'],
      });

      expect(created).toMatchObject({
        team_name: '新設チーム',
        scores: 0,
        registered_classes: ['1A'],
      });
      const classRoom = await env.DB.prepare(
        'SELECT team_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(classRoomId)
        .first<{ team_id: number }>();
      expect(classRoom?.team_id).toBe(created.team_id);

      // insertClassRoom('1A')が作った1A専用の暫定チームは、1Aが移動して
      // 空になった時点で掃除されているはず。
      const oldPlaceholder = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_name = ?'
      )
        .bind('placeholder(1A)')
        .first();
      expect(oldPlaceholder).toBeNull();
    });

    it('class_codesが空配列でもチームを作成できる', async () => {
      const created = await repo.createTeam({
        team_name: 'クラス無しチーム',
        class_codes: [],
      });

      expect(created).toMatchObject({
        team_name: 'クラス無しチーム',
        registered_classes: [],
      });
    });
  });

  describe('updateTeam', () => {
    it('チーム名を更新し、追加のclass_codesを付け替える', async () => {
      const teamId = await insertTeam('元の名前');
      const classRoomId = await insertClassRoom('2A');

      const updated = await repo.updateTeam(teamId, {
        team_name: '新しい名前',
        class_codes: ['2A'],
      });

      expect(updated).toMatchObject({
        team_id: teamId,
        team_name: '新しい名前',
        registered_classes: ['2A'],
      });
      const classRoom = await env.DB.prepare(
        'SELECT team_id FROM class_rooms WHERE class_room_id = ?'
      )
        .bind(classRoomId)
        .first<{ team_id: number }>();
      expect(classRoom?.team_id).toBe(teamId);

      // insertClassRoom('2A')が作った2A専用の暫定チームは、2Aが移動して
      // 空になった時点で掃除されているはず。
      const oldPlaceholder = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_name = ?'
      )
        .bind('placeholder(2A)')
        .first();
      expect(oldPlaceholder).toBeNull();
    });

    it('得点0の移動元チームは、クラスが移動して空になると削除される', async () => {
      const sourceTeamId = await insertTeam('元のチーム');
      await insertClassRoom('4A', sourceTeamId);
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, 0)'
      )
        .bind(sourceTeamId)
        .run();
      const destinationTeamId = await insertTeam('移動先チーム');

      await repo.updateTeam(destinationTeamId, {
        team_name: '移動先チーム',
        class_codes: ['4A'],
      });

      const sourceTeam = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(sourceTeamId)
        .first();
      expect(sourceTeam).toBeNull();
    });

    it('加算と減算で得点が0に戻った移動元チームも、クラスが移動して空になると削除される', async () => {
      const sourceTeamId = await insertTeam('相殺後0点チーム');
      await insertClassRoom('4B', sourceTeamId);
      await repo.addScore(sourceTeamId, 100);
      await repo.addScore(sourceTeamId, -100);
      const destinationTeamId = await insertTeam('移動先チーム3');

      await repo.updateTeam(destinationTeamId, {
        team_name: '移動先チーム3',
        class_codes: ['4B'],
      });

      const sourceTeam = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(sourceTeamId)
        .first();
      expect(sourceTeam).toBeNull();
    });

    it('得点が残っている移動元チームは、クラスが移動して空になっても削除されない', async () => {
      const sourceTeamId = await insertTeam('得点ありチーム');
      await insertClassRoom('5A', sourceTeamId);
      await env.DB.prepare(
        'INSERT INTO team_scores (team_id, scores) VALUES (?, 10)'
      )
        .bind(sourceTeamId)
        .run();
      const destinationTeamId = await insertTeam('移動先チーム2');

      await repo.updateTeam(destinationTeamId, {
        team_name: '移動先チーム2',
        class_codes: ['5A'],
      });

      const sourceTeam = await env.DB.prepare(
        'SELECT team_id FROM teams WHERE team_id = ?'
      )
        .bind(sourceTeamId)
        .first();
      expect(sourceTeam).not.toBeNull();
    });

    it('class_codesに無いクラスは自分専用のチームへ戻る(完全置換)', async () => {
      const teamId = await insertTeam('赤組');
      await insertClassRoom('1A', teamId);
      await insertClassRoom('1B', teamId);

      const updated = await repo.updateTeam(teamId, {
        team_name: '赤組',
        class_codes: ['1A'],
      });

      expect(updated?.registered_classes).toEqual(['1A']);
      const detached = await env.DB.prepare(
        `SELECT t.team_name, t.team_id
         FROM class_rooms c
         JOIN teams t ON t.team_id = c.team_id
         WHERE c.class_code = '1B'`
      ).first<{ team_name: string; team_id: number }>();
      expect(detached?.team_name).toBe('1B組(1B)');
      expect(detached?.team_id).not.toBe(teamId);
    });

    it('class_codesに空配列を渡すと所属クラスが全部外れる', async () => {
      const teamId = await insertTeam('青組');
      await insertClassRoom('3A', teamId);

      const updated = await repo.updateTeam(teamId, {
        team_name: '青組',
        class_codes: [],
      });

      expect(updated?.registered_classes).toEqual([]);
      const detached = await env.DB.prepare(
        `SELECT team_id FROM class_rooms WHERE class_code = '3A'`
      ).first<{ team_id: number }>();
      expect(detached?.team_id).not.toBe(teamId);
    });

    it('存在しないチームの場合はnullを返す', async () => {
      await expect(
        repo.updateTeam(999999, { team_name: '存在しない', class_codes: [] })
      ).resolves.toBeNull();
    });
  });

  describe('delete', () => {
    it('存在するチームを削除するとtrueを返す', async () => {
      const teamId = await insertTeam('削除対象');

      await expect(repo.delete(teamId)).resolves.toBe(true);
      await expect(repo.exists(teamId)).resolves.toBe(false);
    });

    it('存在しないチームの場合はfalseを返す', async () => {
      await expect(repo.delete(999999)).resolves.toBe(false);
    });

    it('所属クラスは自分専用の単独編成へ戻してから削除する', async () => {
      const teamId = await insertTeam('削除対象(複数編成)');
      await insertClassRoom('1A', teamId);
      await insertClassRoom('1B', teamId);

      await expect(repo.delete(teamId)).resolves.toBe(true);
      await expect(repo.exists(teamId)).resolves.toBe(false);

      const detached = await env.DB.prepare(
        `SELECT t.team_name, t.team_id
         FROM class_rooms c
         JOIN teams t ON t.team_id = c.team_id
         WHERE c.class_code IN ('1A', '1B')`
      ).all<{ team_name: string; team_id: number }>();
      expect(detached.results).toHaveLength(2);
      for (const row of detached.results) {
        expect(row.team_id).not.toBe(teamId);
      }
    });

    it('加算と減算で合計0に戻ったが行が残っているチームもFK違反なく削除できる', async () => {
      const teamId = await insertTeam('得点0だが行が残る');
      await repo.addScore(teamId, 100);
      await repo.addScore(teamId, -100);

      const before = await env.DB.prepare(
        'SELECT scores FROM team_scores WHERE team_id = ?'
      )
        .bind(teamId)
        .first<{ scores: number }>();
      expect(before?.scores).toBe(0);

      await expect(repo.delete(teamId)).resolves.toBe(true);
      await expect(repo.exists(teamId)).resolves.toBe(false);
      const after = await env.DB.prepare(
        'SELECT COUNT(*) AS count FROM team_scores WHERE team_id = ?'
      )
        .bind(teamId)
        .first<{ count: number }>();
      expect(after?.count).toBe(0);
    });
  });

  describe('addScore', () => {
    it('team_scoresが無いチームでも安全に加算できる(UPSERT)', async () => {
      const teamId = await insertTeam('採点対象');

      const result = await repo.addScore(teamId, 10);

      expect(result).toMatchObject({
        team_id: teamId,
        team_name: '採点対象',
        scores: 10,
      });
    });

    it('既存の得点に加算する', async () => {
      const teamId = await insertTeam('採点対象2');
      await repo.addScore(teamId, 10);

      const result = await repo.addScore(teamId, 5);

      expect(result.scores).toBe(15);
    });

    it('負の値を渡すと減算になる(訂正用途)', async () => {
      const teamId = await insertTeam('採点対象3');
      await repo.addScore(teamId, 10);

      const result = await repo.addScore(teamId, -3);

      expect(result.scores).toBe(7);
    });
  });
});
