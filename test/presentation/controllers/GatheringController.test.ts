import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IGatheringService } from '../../../src/application/services/IGatheringService';
import { createGatheringController } from '../../../src/presentation/controllers/GatheringController';

function setup() {
  const service: IGatheringService = {
    getAllGatherings: vi.fn(),
    getGatheringsByEventId: vi.fn(),
    createGathering: vi.fn(),
    deleteGathering: vi.fn(),
  };
  const controller = createGatheringController(service);
  const app = new Hono();
  app.get('/gatherings', c => controller.getAllGatherings(c));
  app.get('/events/:eventId/gatherings', c =>
    controller.getGatheringsByEventId(c)
  );
  app.post('/gatherings', c => controller.createGathering(c));
  app.delete('/gatherings/:gatheringId', c => controller.deleteGathering(c));
  return { app, service };
}

describe('GatheringController', () => {
  it('一覧をJSONで返す', async () => {
    const { app, service } = setup();
    (service.getAllGatherings as ReturnType<typeof vi.fn>).mockResolvedValue([
      { gathering_id: 1 },
    ]);

    const response = await app.request('/gatherings');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ gathering_id: 1 }]);
  });

  it('競技IDを指定して集合予定一覧を返す', async () => {
    const { app, service } = setup();
    (
      service.getGatheringsByEventId as ReturnType<typeof vi.fn>
    ).mockResolvedValue([{ gathering_id: 1 }, { gathering_id: 2 }]);

    const response = await app.request('/events/3/gatherings');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([
      { gathering_id: 1 },
      { gathering_id: 2 },
    ]);
    expect(service.getGatheringsByEventId).toHaveBeenCalledWith(3);
  });

  it('集合予定がない競技では空配列を返す', async () => {
    const { app, service } = setup();
    (
      service.getGatheringsByEventId as ReturnType<typeof vi.fn>
    ).mockResolvedValue([]);

    const response = await app.request('/events/3/gatherings');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  it('不正な競技IDは400、存在しない競技は404を返す', async () => {
    const { app, service } = setup();
    (
      service.getGatheringsByEventId as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('Event not found'));

    const invalid = await app.request('/events/invalid/gatherings');
    const notFound = await app.request('/events/999999/gatherings');

    expect(invalid.status).toBe(400);
    expect(notFound.status).toBe(404);
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
        eventId: 2,
        gatheringSpotId: 3,
        gatheringTime: '08:50',
        round: 1,
      }),
    });

    expect(response.status).toBe(201);
    expect(service.createGathering).toHaveBeenCalledWith({
      event_id: 2,
      gathering_spot_id: 3,
      gathering_time: '08:50',
      round: 1,
    });
  });

  it('任意の集合時刻と回数を省略できる', async () => {
    const { app, service } = setup();
    (service.createGathering as ReturnType<typeof vi.fn>).mockResolvedValue({
      gathering_id: 1,
    });

    const response = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: 2, gatheringSpotId: 3 }),
    });

    expect(response.status).toBe(201);
    expect(service.createGathering).toHaveBeenCalledWith({
      event_id: 2,
      gathering_spot_id: 3,
      gathering_time: undefined,
      round: undefined,
    });
  });

  it.each([
    [{ gatheringSpotId: 3 }, '必須のイベントID欠落'],
    [{ eventId: 2 }, '必須の集合場所ID欠落'],
    [{ eventId: 2, gatheringSpotId: 3, gatheringTime: '0900' }, '時刻形式'],
    [{ eventId: 2, gatheringSpotId: 3, round: 0 }, '回数下限'],
    [{ eventId: 2, gatheringSpotId: 3, round: 100 }, '回数上限'],
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

  it('参照先が存在しない場合は404を返す', async () => {
    const { app, service } = setup();
    (service.createGathering as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Event not found')
    );

    const response = await app.request('/gatherings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId: 2, gatheringSpotId: 3 }),
    });

    expect(response.status).toBe(404);
  });

  it('集合予定を削除して204を返す', async () => {
    const { app, service } = setup();

    const response = await app.request('/gatherings/1', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(service.deleteGathering).toHaveBeenCalledWith(1);
  });

  it('不正な集合IDは400、存在しない集合は404を返す', async () => {
    const { app, service } = setup();
    (service.deleteGathering as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Gathering not found')
    );

    const invalid = await app.request('/gatherings/invalid', {
      method: 'DELETE',
    });
    const notFound = await app.request('/gatherings/999', {
      method: 'DELETE',
    });

    expect(invalid.status).toBe(400);
    expect(notFound.status).toBe(404);
  });

  it('Serviceの想定外例外は500を返す', async () => {
    const { app, service } = setup();
    (service.getAllGatherings as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('database error')
    );

    const response = await app.request('/gatherings');

    expect(response.status).toBe(500);
  });
});
