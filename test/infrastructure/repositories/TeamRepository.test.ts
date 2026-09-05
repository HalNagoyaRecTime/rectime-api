import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { createTeamRepository } from '../../../src/infrastructure/repositories/TeamRepository';
import type { ITeamRepository } from '../../../src/domain/interfaces/repositories/ITeamRepository';

describe('TeamRepository', () => {
  let repo: ITeamRepository;

  beforeEach(async () => {
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
