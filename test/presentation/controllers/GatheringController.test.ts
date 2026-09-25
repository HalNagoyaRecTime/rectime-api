import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IGatheringService } from '../../../src/application/services/IGatheringService';
import { createGatheringController } from '../../../src/presentation/controllers/GatheringController';

function setup() {
  const service: IGatheringService = {
    getAllGatherings: vi.fn(),
    getGatheringsByEventId: vi.fn(),
  };
  const controller = createGatheringController(service);
  const app = new Hono();
  app.get('/gatherings', c => controller.getAllGatherings(c));
  app.get('/events/:eventId/gatherings', c =>
    controller.getGatheringsByEventId(c)
  );
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

  it('Serviceの想定外例外は500を返す', async () => {
    const { app, service } = setup();
    (service.getAllGatherings as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('database error')
    );

    const response = await app.request('/gatherings');

    expect(response.status).toBe(500);
  });
});
