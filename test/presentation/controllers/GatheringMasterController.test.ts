import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IGatheringGroupMemberService } from '../../../src/application/services/IGatheringGroupMemberService';
import type { IGatheringSpotService } from '../../../src/application/services/IGatheringSpotService';
import { createGatheringGroupMemberController } from '../../../src/presentation/controllers/GatheringGroupMemberController';
import { createGatheringSpotController } from '../../../src/presentation/controllers/GatheringSpotController';

function setup() {
  const spotService: IGatheringSpotService = {
    getAllGatheringSpots: vi.fn(),
    createGatheringSpot: vi.fn(),
    updateGatheringSpot: vi.fn(),
  };
  const memberService: IGatheringGroupMemberService = {
    getGatheringMembers: vi.fn(),
    addGatheringMember: vi.fn(),
    removeGatheringMember: vi.fn(),
  };
  const spotController = createGatheringSpotController(spotService);
  const memberController = createGatheringGroupMemberController(memberService);
  const app = new Hono();
  app.get('/gathering-spots', c => spotController.getAllGatheringSpots(c));
  app.post('/gathering-spots', c => spotController.createGatheringSpot(c));
  app.put('/gathering-spots/:gatheringSpotId', c =>
    spotController.updateGatheringSpot(c)
  );
  app.get('/gatherings/:gatheringId/members', c =>
    memberController.getGatheringMembers(c)
  );
  app.post('/gatherings/:gatheringId/members', c =>
    memberController.addGatheringMember(c)
  );
  app.delete('/gatherings/:gatheringId/members/:userId', c =>
    memberController.removeGatheringMember(c)
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

  it('集合対象者の一覧取得・追加・解除をServiceへ委譲する', async () => {
    const { app, memberService } = setup();
    (
      memberService.getGatheringMembers as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);
    (
      memberService.addGatheringMember as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ gathering_group_member_id: 1 });

    const listResponse = await app.request('/gatherings/1/members');
    const addResponse = await app.request('/gatherings/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 2 }),
    });
    const deleteResponse = await app.request('/gatherings/1/members/2', {
      method: 'DELETE',
    });

    expect(listResponse.status).toBe(200);
    expect(addResponse.status).toBe(201);
    expect(deleteResponse.status).toBe(204);
    expect(memberService.getGatheringMembers).toHaveBeenCalledWith(1);
    expect(memberService.addGatheringMember).toHaveBeenCalledWith(1, 2);
    expect(memberService.removeGatheringMember).toHaveBeenCalledWith(1, 2);
  });

  it('不正な集合IDまたは利用者IDは400で拒否する', async () => {
    const { app, memberService } = setup();

    const invalidGathering = await app.request('/gatherings/invalid/members');
    const invalidUser = await app.request('/gatherings/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 0 }),
    });

    expect(invalidGathering.status).toBe(400);
    expect(invalidUser.status).toBe(400);
    expect(memberService.getGatheringMembers).not.toHaveBeenCalled();
    expect(memberService.addGatheringMember).not.toHaveBeenCalled();
  });

  it('存在しない集合または利用者は404を返す', async () => {
    const { app, memberService } = setup();
    (
      memberService.getGatheringMembers as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Gathering not found'));
    (
      memberService.addGatheringMember as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('User not found'));

    const listResponse = await app.request('/gatherings/999/members');
    const addResponse = await app.request('/gatherings/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 999 }),
    });

    expect(listResponse.status).toBe(404);
    expect(addResponse.status).toBe(404);
  });

  it('重複した集合対象者は409を返す', async () => {
    const { app, memberService } = setup();
    (
      memberService.addGatheringMember as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Gathering member already exists'));

    const response = await app.request('/gatherings/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 2 }),
    });

    expect(response.status).toBe(409);
  });

  it('旧集合グループAPIは公開しない', async () => {
    const { app } = setup();

    const listResponse = await app.request('/gathering-groups');
    const memberResponse = await app.request('/gathering-groups/1/members');

    expect(listResponse.status).toBe(404);
    expect(memberResponse.status).toBe(404);
  });
});
