import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createGatheringGroupMemberController } from '../../../src/presentation/controllers/GatheringGroupMemberController';
import { createGatheringGroupController } from '../../../src/presentation/controllers/GatheringGroupController';
import { createGatheringSpotController } from '../../../src/presentation/controllers/GatheringSpotController';
import type { IGatheringGroupMemberService } from '../../../src/application/services/IGatheringGroupMemberService';
import type { IGatheringGroupService } from '../../../src/application/services/IGatheringGroupService';
import type { IGatheringSpotService } from '../../../src/application/services/IGatheringSpotService';

function setup() {
  const gatheringSpotService: IGatheringSpotService = {
    getAllGatheringSpots: vi.fn(),
    createGatheringSpot: vi.fn(),
  };
  const gatheringGroupService: IGatheringGroupService = {
    getAllGatheringGroups: vi.fn(),
    createGatheringGroup: vi.fn(),
  };
  const gatheringGroupMemberService: IGatheringGroupMemberService = {
    getGatheringGroupMembers: vi.fn(),
    addGatheringGroupMember: vi.fn(),
    removeGatheringGroupMember: vi.fn(),
  };
  const gatheringSpotController =
    createGatheringSpotController(gatheringSpotService);
  const gatheringGroupController = createGatheringGroupController(
    gatheringGroupService
  );
  const gatheringGroupMemberController = createGatheringGroupMemberController(
    gatheringGroupMemberService
  );
  const app = new Hono();
  app.get('/gathering-spots', c =>
    gatheringSpotController.getAllGatheringSpots(c)
  );
  app.post('/gathering-spots', c =>
    gatheringSpotController.createGatheringSpot(c)
  );
  app.get('/gathering-groups', c =>
    gatheringGroupController.getAllGatheringGroups(c)
  );
  app.post('/gathering-groups', c =>
    gatheringGroupController.createGatheringGroup(c)
  );
  app.get('/gathering-groups/:gatheringGroupId/members', c =>
    gatheringGroupMemberController.getGatheringGroupMembers(c)
  );
  app.post('/gathering-groups/:gatheringGroupId/members', c =>
    gatheringGroupMemberController.addGatheringGroupMember(c)
  );
  app.delete('/gathering-groups/:gatheringGroupId/members/:userId', c =>
    gatheringGroupMemberController.removeGatheringGroupMember(c)
  );
  return {
    app,
    gatheringSpotService,
    gatheringGroupService,
    gatheringGroupMemberService,
  };
}

describe('Gathering master controllers', () => {
  it('集合場所・集合グループの作成時に名前をServiceへ渡し、201を返す', async () => {
    const { app, gatheringSpotService, gatheringGroupService } = setup();
    (
      gatheringSpotService.createGatheringSpot as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ gathering_spot_id: 1 });
    (
      gatheringGroupService.createGatheringGroup as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ gathering_group_id: 1 });

    const spotResponse = await app.request('/gathering-spots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '体育館前' }),
    });
    const groupResponse = await app.request('/gathering-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 5 }),
    });

    expect(spotResponse.status).toBe(201);
    expect(groupResponse.status).toBe(201);
    expect(gatheringSpotService.createGatheringSpot).toHaveBeenCalledWith(
      '体育館前'
    );
    expect(gatheringGroupService.createGatheringGroup).toHaveBeenCalledWith(5);
  });

  it('空の名称は400で拒否する', async () => {
    const { app, gatheringSpotService } = setup();

    const response = await app.request('/gathering-spots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '   ' }),
    });

    expect(response.status).toBe(400);
    expect(gatheringSpotService.createGatheringSpot).not.toHaveBeenCalled();
  });

  it('集合場所・集合グループの一覧をJSONで返す', async () => {
    const { app, gatheringSpotService, gatheringGroupService } = setup();
    (
      gatheringSpotService.getAllGatheringSpots as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      { gathering_spot_id: 1, gathering_spot_name: '体育館前' },
    ]);
    (
      gatheringGroupService.getAllGatheringGroups as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ gathering_group_id: 2, user_id: 5 }]);

    const spotResponse = await app.request('/gathering-spots');
    const groupResponse = await app.request('/gathering-groups');

    expect(await spotResponse.json()).toEqual([
      { gathering_spot_id: 1, gathering_spot_name: '体育館前' },
    ]);
    expect(await groupResponse.json()).toEqual([
      { gathering_group_id: 2, user_id: 5 },
    ]);
  });

  it('グループ所属の一覧取得・追加・解除をServiceへ委譲する', async () => {
    const { app, gatheringGroupMemberService } = setup();
    (
      gatheringGroupMemberService.getGatheringGroupMembers as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue([]);
    (
      gatheringGroupMemberService.addGatheringGroupMember as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue({ gathering_group_member_id: 1 });
    (
      gatheringGroupMemberService.removeGatheringGroupMember as ReturnType<
        typeof vi.fn
      >
    ).mockResolvedValue(undefined);

    const listResponse = await app.request('/gathering-groups/1/members');
    const addResponse = await app.request('/gathering-groups/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 2 }),
    });
    const deleteResponse = await app.request('/gathering-groups/1/members/2', {
      method: 'DELETE',
    });

    expect(listResponse.status).toBe(200);
    expect(addResponse.status).toBe(201);
    expect(deleteResponse.status).toBe(204);
    expect(
      gatheringGroupMemberService.getGatheringGroupMembers
    ).toHaveBeenCalledWith(1);
    expect(
      gatheringGroupMemberService.addGatheringGroupMember
    ).toHaveBeenCalledWith(1, 2);
    expect(
      gatheringGroupMemberService.removeGatheringGroupMember
    ).toHaveBeenCalledWith(1, 2);
  });

  it('不正なグループIDまたはuserIdは400で拒否する', async () => {
    const { app, gatheringGroupMemberService } = setup();

    const invalidGroupResponse = await app.request(
      '/gathering-groups/invalid/members'
    );
    const invalidUserResponse = await app.request(
      '/gathering-groups/1/members',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 0 }),
      }
    );

    expect(invalidGroupResponse.status).toBe(400);
    expect(invalidUserResponse.status).toBe(400);
    expect(
      gatheringGroupMemberService.getGatheringGroupMembers
    ).not.toHaveBeenCalled();
    expect(
      gatheringGroupMemberService.addGatheringGroupMember
    ).not.toHaveBeenCalled();
  });

  it('存在しないグループまたはユーザーは404を返す', async () => {
    const { app, gatheringGroupMemberService } = setup();
    (
      gatheringGroupMemberService.getGatheringGroupMembers as ReturnType<
        typeof vi.fn
      >
    ).mockRejectedValue(new Error('Gathering group not found'));
    (
      gatheringGroupMemberService.addGatheringGroupMember as ReturnType<
        typeof vi.fn
      >
    ).mockRejectedValue(new Error('User not found'));
    (
      gatheringGroupMemberService.removeGatheringGroupMember as ReturnType<
        typeof vi.fn
      >
    ).mockRejectedValue(new Error('Gathering group not found'));

    const listResponse = await app.request('/gathering-groups/999/members');
    const addResponse = await app.request('/gathering-groups/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 999 }),
    });
    const deleteResponse = await app.request(
      '/gathering-groups/999/members/1',
      {
        method: 'DELETE',
      }
    );

    expect(listResponse.status).toBe(404);
    expect(addResponse.status).toBe(404);
    expect(deleteResponse.status).toBe(404);
  });

  it('Serviceの想定外例外は500を返す', async () => {
    const {
      app,
      gatheringSpotService,
      gatheringGroupService,
      gatheringGroupMemberService,
    } = setup();
    (
      gatheringSpotService.getAllGatheringSpots as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('spot error'));
    (
      gatheringGroupService.createGatheringGroup as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('group error'));
    (
      gatheringGroupMemberService.addGatheringGroupMember as ReturnType<
        typeof vi.fn
      >
    ).mockRejectedValue(new Error('member error'));

    const spotResponse = await app.request('/gathering-spots');
    const groupResponse = await app.request('/gathering-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 5 }),
    });
    const memberResponse = await app.request('/gathering-groups/1/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 2 }),
    });

    expect(spotResponse.status).toBe(500);
    expect(groupResponse.status).toBe(500);
    expect(memberResponse.status).toBe(500);
  });

  it('DELETEの不正なIDは400で拒否する', async () => {
    const { app, gatheringGroupMemberService } = setup();

    const response = await app.request('/gathering-groups/1/members/invalid', {
      method: 'DELETE',
    });

    expect(response.status).toBe(400);
    expect(
      gatheringGroupMemberService.removeGatheringGroupMember
    ).not.toHaveBeenCalled();
  });
});
