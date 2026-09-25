import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IGatheringGroupMemberService } from '../../../src/application/services/IGatheringGroupMemberService';
import type { IGatheringSpotService } from '../../../src/application/services/IGatheringSpotService';
import { createGatheringGroupMemberController } from '../../../src/presentation/controllers/GatheringGroupMemberController';
import { createGatheringSpotController } from '../../../src/presentation/controllers/GatheringSpotController';

function setup() {
  const spotService: IGatheringSpotService = {
    getAllGatheringSpots: vi.fn(),
    getGatheringSpotPage: vi.fn(),
    createGatheringSpot: vi.fn(),
    updateGatheringSpot: vi.fn(),
    deleteGatheringSpot: vi.fn(),
  };
  const memberService: IGatheringGroupMemberService = {
    getGatheringMembers: vi.fn(),
    replaceGatheringMembers: vi.fn(),
  };
  const spotController = createGatheringSpotController(spotService);
  const memberController = createGatheringGroupMemberController(memberService);
  const app = new Hono();
  app.get('/gathering-spots', c => spotController.getAllGatheringSpots(c));
  app.post('/gathering-spots', c => spotController.createGatheringSpot(c));
  app.put('/gathering-spots/:gatheringSpotId', c =>
    spotController.updateGatheringSpot(c)
  );
  app.delete('/gathering-spots/:gatheringSpotId', c =>
    spotController.deleteGatheringSpot(c)
  );
  app.get('/gatherings/:gatheringId/members', c =>
    memberController.getGatheringMembers(c)
  );
  app.put('/gatherings/:gatheringId/members', c =>
    memberController.replaceGatheringMembers(c)
  );
  return { app, spotService, memberService };
}

describe('Gathering master controllers', () => {
  it('集合場所を作成し、201を返す', async () => {
    const { app, spotService } = setup();
    (
      spotService.createGatheringSpot as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ gathering_spot_id: 1 });

    const response = await app.request('/gathering-spots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '体育館前' }),
    });

    expect(response.status).toBe(201);
    expect(spotService.createGatheringSpot).toHaveBeenCalledWith('体育館前');
  });

  it('クエリ付きの集合場所一覧は検索・ページネーションを委譲する', async () => {
    const { app, spotService } = setup();
    (
      spotService.getGatheringSpotPage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      gathering_spots: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    const response = await app.request('/gathering-spots?name=体育&limit=20');

    expect(response.status).toBe(200);
    expect(spotService.getGatheringSpotPage).toHaveBeenCalledWith({
      name: '体育',
      limit: 20,
      offset: 0,
    });
  });

  it('ソート付きの集合場所一覧はソート条件を委譲する', async () => {
    const { app, spotService } = setup();
    (
      spotService.getGatheringSpotPage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      gathering_spots: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    const response = await app.request(
      '/gathering-spots?sortBy=name&sortOrder=desc'
    );

    expect(response.status).toBe(200);
    expect(spotService.getGatheringSpotPage).toHaveBeenCalledWith({
      limit: 20,
      offset: 0,
      sortBy: 'name',
      sortOrder: 'desc',
    });
  });

  it('検索とソート付きの集合場所一覧は全条件を委譲する', async () => {
    const { app, spotService } = setup();
    (
      spotService.getGatheringSpotPage as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      gathering_spots: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    const response = await app.request(
      '/gathering-spots?name=体育館&limit=20&offset=0&sortBy=updatedAt&sortOrder=desc'
    );

    expect(response.status).toBe(200);
    expect(spotService.getGatheringSpotPage).toHaveBeenCalledWith({
      name: '体育館',
      limit: 20,
      offset: 0,
      sortBy: 'updatedAt',
      sortOrder: 'desc',
    });
  });

  it('不正な集合場所一覧クエリは400で拒否する', async () => {
    const { app, spotService } = setup();

    const response = await app.request('/gathering-spots?limit=0');

    expect(response.status).toBe(400);
    expect(spotService.getGatheringSpotPage).not.toHaveBeenCalled();
  });

  it.each([
    ['sortBy', 'invalidColumn'],
    ['sortOrder', 'invalidOrder'],
  ])('不正な%sは400で拒否する', async (key, value) => {
    const { app, spotService } = setup();

    const response = await app.request(`/gathering-spots?${key}=${value}`);

    expect(response.status).toBe(400);
    expect(spotService.getGatheringSpotPage).not.toHaveBeenCalled();
  });

  it('未使用の集合場所を削除し204を返す', async () => {
    const { app, spotService } = setup();

    const response = await app.request('/gathering-spots/1', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(spotService.deleteGatheringSpot).toHaveBeenCalledWith(1);
  });

  it('利用中の集合場所の削除は409を返す', async () => {
    const { app, spotService } = setup();
    (
      spotService.deleteGatheringSpot as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Gathering spot is in use'));

    const response = await app.request('/gathering-spots/1', {
      method: 'DELETE',
    });

    expect(response.status).toBe(409);
  });

  it('存在しない集合場所の削除は404を返す', async () => {
    const { app, spotService } = setup();
    (
      spotService.deleteGatheringSpot as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Gathering spot not found'));

    const response = await app.request('/gathering-spots/999', {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    expect(spotService.deleteGatheringSpot).toHaveBeenCalledWith(999);
  });

  it('集合場所の名称を更新して200を返す', async () => {
    const { app, spotService } = setup();
    (
      spotService.updateGatheringSpot as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      gathering_spot_id: 1,
      gathering_spot_name: '正門前',
    });

    const response = await app.request('/gathering-spots/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '正門前' }),
    });

    expect(response.status).toBe(200);
    expect(spotService.updateGatheringSpot).toHaveBeenCalledWith(1, {
      gathering_spot_name: '正門前',
    });
  });

  it('集合場所更新の不正なIDと空の名称は400で拒否する', async () => {
    const { app, spotService } = setup();

    const invalidId = await app.request('/gathering-spots/invalid', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '正門前' }),
    });
    const invalidName = await app.request('/gathering-spots/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '   ' }),
    });

    expect(invalidId.status).toBe(400);
    expect(invalidName.status).toBe(400);
    expect(spotService.updateGatheringSpot).not.toHaveBeenCalled();
  });

  it('存在しない集合場所の更新は404を返す', async () => {
    const { app, spotService } = setup();
    (
      spotService.updateGatheringSpot as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Gathering spot not found'));

    const response = await app.request('/gathering-spots/999', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '正門前' }),
    });

    expect(response.status).toBe(404);
  });

  it('集合対象者の一覧取得をServiceへ委譲する', async () => {
    const { app, memberService } = setup();
    (
      memberService.getGatheringMembers as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    const listResponse = await app.request('/gatherings/1/members');

    expect(listResponse.status).toBe(200);
    expect(memberService.getGatheringMembers).toHaveBeenCalledWith(1);
  });

  it('参加者集合の一括置換をServiceへ委譲する', async () => {
    const { app, memberService } = setup();
    const member = {
      gathering_group_member_id: 3,
      gathering_id: 1,
      user_id: 2,
      created_at: '2026-01-01 00:00:00',
      updated_at: '2026-01-01 00:00:00',
    };
    (
      memberService.replaceGatheringMembers as ReturnType<typeof vi.fn>
    ).mockResolvedValue([member]);

    const response = await app.request('/gatherings/1/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: [2] }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([member]);
    expect(memberService.replaceGatheringMembers).toHaveBeenCalledWith(1, [2]);
  });

  it('重複したuser_idsを含む一括置換は400を返す', async () => {
    const { app, memberService } = setup();

    const response = await app.request('/gatherings/1/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: [2, 2] }),
    });

    expect(response.status).toBe(400);
    expect(memberService.replaceGatheringMembers).not.toHaveBeenCalled();
  });

  it('user_idsが30件を超える一括置換は400を返す', async () => {
    const { app, memberService } = setup();

    const response = await app.request('/gatherings/1/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_ids: Array.from({ length: 31 }, (_, i) => i + 1),
      }),
    });

    expect(response.status).toBe(400);
    expect(memberService.replaceGatheringMembers).not.toHaveBeenCalled();
  });

  it('user_idsがちょうど30件の一括置換は受理する', async () => {
    const { app, memberService } = setup();
    (
      memberService.replaceGatheringMembers as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    const userIds = Array.from({ length: 30 }, (_, i) => i + 1);
    const response = await app.request('/gatherings/1/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: userIds }),
    });

    expect(response.status).toBe(200);
    expect(memberService.replaceGatheringMembers).toHaveBeenCalledWith(
      1,
      userIds
    );
  });

  it('存在しないuser_idsを含む一括置換は404を返す', async () => {
    const { app, memberService } = setup();
    (
      memberService.replaceGatheringMembers as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('User not found'));

    const response = await app.request('/gatherings/1/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_ids: [999] }),
    });

    expect(response.status).toBe(404);
  });

  it('不正な集合IDは400で拒否する', async () => {
    const { app, memberService } = setup();

    const invalidGathering = await app.request('/gatherings/invalid/members');

    expect(invalidGathering.status).toBe(400);
    expect(memberService.getGatheringMembers).not.toHaveBeenCalled();
  });

  it('存在しない集合は404を返す', async () => {
    const { app, memberService } = setup();
    (
      memberService.getGatheringMembers as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Gathering not found'));
    const listResponse = await app.request('/gatherings/999/members');

    expect(listResponse.status).toBe(404);
  });

  it('旧集合グループAPIは公開しない', async () => {
    const { app } = setup();

    const listResponse = await app.request('/gathering-groups');
    const memberResponse = await app.request('/gathering-groups/1/members');

    expect(listResponse.status).toBe(404);
    expect(memberResponse.status).toBe(404);
  });
});
