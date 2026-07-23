import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { createGatheringController } from '../../../src/presentation/controllers/GatheringController';
import type { IGatheringService } from '../../../src/application/services/IGatheringService';

function setup() {
  const service: IGatheringService = {
    getAllGatherings: vi.fn(),
    createGathering: vi.fn(),
    deleteGathering: vi.fn(),
  };
  const controller = createGatheringController(service);
  const app = new Hono();
  app.get('/gatherings', c => controller.getAllGatherings(c));
  app.post('/gatherings', c => controller.createGathering(c));
  app.delete('/gatherings/:gatheringId', c => controller.deleteGathering(c));
  return { app, service };
}

describe('GatheringController', () => {
  it('一覧をJSONで返す', async () => {
    const { app, service } = setup();
    (service.getAllGatherings as ReturnType<typeof vi.fn>).mockResolvedValue([
      { gathering_id: 1, gathering_group_name: '赤組' },
    ]);

    const response = await app.request('/gatherings');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { gathering_id: 1, gathering_group_name: '赤組' },
    ]);
  });

  it('一覧取得時の想定外例外は500を返す', async () => {
    const { app, service } = setup();
    (service.getAllGatherings as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('database error')
    );

    const response = await app.request('/gatherings');

    expect(response.status).toBe(500);
  });

  it('作成リクエストをServiceへ変換して201を返す', async () => {
    const { app, service } = setup();
    (service.createGathering as ReturnType<typeof vi.fn>).mockResolvedValue({
      gathering_id: 1,
    });

    const response = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gatheringGroupId: 1,
        eventId: 2,
        gatheringSpotId: 3,
        gatheringTime: '08:50',
        round: 1,
      }),
    });

    expect(response.status).toBe(201);
    expect(service.createGathering).toHaveBeenCalledWith({
      gatheringGroupId: 1,
      eventId: 2,
      gatheringSpotId: 3,
      gatheringTime: '08:50',
      round: 1,
    });
  });

  it('不正な時刻形式は400で拒否する', async () => {
    const { app, service } = setup();
    const response = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gatheringGroupId: 1,
        eventId: 2,
        gatheringSpotId: 3,
        gatheringTime: '0900',
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createGathering).not.toHaveBeenCalled();
  });

  it('任意の集合時刻と回数を省略した場合、DTOに含めずServiceへ渡す', async () => {
    const { app, service } = setup();
    (service.createGathering as ReturnType<typeof vi.fn>).mockResolvedValue({
      gathering_id: 1,
    });

    const response = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gatheringGroupId: 1,
        eventId: 2,
        gatheringSpotId: 3,
      }),
    });

    expect(response.status).toBe(201);
    expect(service.createGathering).toHaveBeenCalledWith({
      gatheringGroupId: 1,
      eventId: 2,
      gatheringSpotId: 3,
    });
  });

  it('未設定時刻と回数の境界値を受け付ける', async () => {
    const { app, service } = setup();
    (service.createGathering as ReturnType<typeof vi.fn>).mockResolvedValue({
      gathering_id: 1,
    });

    const first = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gatheringGroupId: 1,
        eventId: 2,
        gatheringSpotId: 3,
        gatheringTime: '99:59',
        round: 1,
      }),
    });
    const second = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gatheringGroupId: 4,
        eventId: 5,
        gatheringSpotId: 6,
        gatheringTime: '08:50',
        round: 99,
      }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(service.createGathering).toHaveBeenNthCalledWith(1, {
      gatheringGroupId: 1,
      eventId: 2,
      gatheringSpotId: 3,
      gatheringTime: '99:59',
      round: 1,
    });
    expect(service.createGathering).toHaveBeenNthCalledWith(2, {
      gatheringGroupId: 4,
      eventId: 5,
      gatheringSpotId: 6,
      gatheringTime: '08:50',
      round: 99,
    });
  });

  it.each([
    [{ eventId: 2, gatheringSpotId: 3 }, '必須のグループID欠落'],
    [{ gatheringGroupId: 1, gatheringSpotId: 3 }, '必須のイベントID欠落'],
    [{ gatheringGroupId: 1, eventId: 2 }, '必須の集合場所ID欠落'],
    [
      { gatheringGroupId: 1, eventId: 2, gatheringSpotId: 3, round: 0 },
      '回数が下限未満',
    ],
    [
      { gatheringGroupId: 1, eventId: 2, gatheringSpotId: 3, round: 100 },
      '回数が上限超過',
    ],
  ])('%sは400で拒否する', async (body, _description) => {
    const { app, service } = setup();

    const response = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(400);
    expect(service.createGathering).not.toHaveBeenCalled();
  });

  it('不正なJSONは400で拒否する', async () => {
    const { app, service } = setup();

    const response = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });

    expect(response.status).toBe(400);
    expect(service.createGathering).not.toHaveBeenCalled();
  });

  it('参照先が存在しない場合は404、グループ重複は409を返す', async () => {
    const { app, service } = setup();
    (service.createGathering as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('Event not found'))
      .mockRejectedValueOnce(
        new Error('Gathering already exists for this group')
      );
    const body = JSON.stringify({
      gatheringGroupId: 1,
      eventId: 2,
      gatheringSpotId: 3,
    });

    const notFound = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    const conflict = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });

    expect(notFound.status).toBe(404);
    expect(conflict.status).toBe(409);
  });

  it('作成時の想定外例外は500を返す', async () => {
    const { app, service } = setup();
    (service.createGathering as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('database error')
    );

    const response = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gatheringGroupId: 1,
        eventId: 2,
        gatheringSpotId: 3,
      }),
    });

    expect(response.status).toBe(500);
  });

  it('集合設定を削除し、存在しないIDは404、不正なIDは400を返す', async () => {
    const { app, service } = setup();
    (service.deleteGathering as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Gathering not found'));

    const deleted = await app.request('/gatherings/1', { method: 'DELETE' });
    const missing = await app.request('/gatherings/999', { method: 'DELETE' });
    const invalid = await app.request('/gatherings/invalid', {
      method: 'DELETE',
    });

    expect(deleted.status).toBe(204);
    expect(missing.status).toBe(404);
    expect(invalid.status).toBe(400);
    expect(service.deleteGathering).toHaveBeenCalledWith(1);
    expect(service.deleteGathering).toHaveBeenCalledWith(999);
  });
});
