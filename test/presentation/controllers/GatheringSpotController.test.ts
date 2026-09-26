import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IGatheringSpotService } from '../../../src/application/services/IGatheringSpotService';
import { createGatheringSpotController } from '../../../src/presentation/controllers/GatheringSpotController';

function setup() {
  const gatheringSpotService: IGatheringSpotService = {
    getAllGatheringSpots: vi.fn(),
    getGatheringSpotPage: vi.fn(),
    createGatheringSpot: vi.fn(),
    updateGatheringSpot: vi.fn(),
    deleteGatheringSpot: vi.fn(),
  };
  const controller = createGatheringSpotController(gatheringSpotService);
  const app = new Hono();
  app.get('/gathering-spots', c => controller.getAllGatheringSpots(c));
  app.post('/gathering-spots', c => controller.createGatheringSpot(c));
  app.put('/gathering-spots/:gatheringSpotId', c =>
    controller.updateGatheringSpot(c)
  );
  app.delete('/gathering-spots/:gatheringSpotId', c =>
    controller.deleteGatheringSpot(c)
  );
  return { app, gatheringSpotService };
}

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe('GatheringSpotController', () => {
  it('クエリなしの一覧は全件取得を使う', async () => {
    const { app, gatheringSpotService } = setup();
    mocked(gatheringSpotService.getAllGatheringSpots).mockResolvedValue([]);

    const response = await app.request('/gathering-spots');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(gatheringSpotService.getAllGatheringSpots).toHaveBeenCalledOnce();
    expect(gatheringSpotService.getGatheringSpotPage).not.toHaveBeenCalled();
  });

  it('有効な一覧queryをページ検索へ渡す', async () => {
    const { app, gatheringSpotService } = setup();
    mocked(gatheringSpotService.getGatheringSpotPage).mockResolvedValue({
      gathering_spots: [],
      total: 0,
      limit: 25,
      offset: 5,
    });

    const response = await app.request(
      '/gathering-spots?limit=25&offset=5&name=体育&sortBy=updatedAt&sortOrder=asc'
    );

    expect(response.status).toBe(200);
    expect(gatheringSpotService.getGatheringSpotPage).toHaveBeenCalledWith({
      limit: 25,
      offset: 5,
      name: '体育',
      sortBy: 'updatedAt',
      sortOrder: 'asc',
    });
    expect(gatheringSpotService.getAllGatheringSpots).not.toHaveBeenCalled();
  });

  it.each([
    'limit=0',
    'limit=101',
    'offset=-1',
    'sortBy=invalid',
    'sortOrder=ascending',
  ])('不正な一覧query %s は400を返す', async query => {
    const { app, gatheringSpotService } = setup();

    const response = await app.request('/gathering-spots?' + query);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_GATHERING_SPOT_LIST_QUERY' },
    });
    expect(gatheringSpotService.getGatheringSpotPage).not.toHaveBeenCalled();
  });

  it('OpenAPIのbody schemaを使って集合場所を作成する', async () => {
    const { app, gatheringSpotService } = setup();
    mocked(gatheringSpotService.createGatheringSpot).mockResolvedValue({
      gathering_spot_id: 1,
    });

    const response = await app.request('/gathering-spots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '第1集合場所' }),
    });

    expect(response.status).toBe(201);
    expect(gatheringSpotService.createGatheringSpot).toHaveBeenCalledWith(
      '第1集合場所'
    );
  });

  it('path schemaのIDを数値へ変換して更新する', async () => {
    const { app, gatheringSpotService } = setup();
    mocked(gatheringSpotService.updateGatheringSpot).mockResolvedValue({
      gathering_spot_id: 7,
    });

    const response = await app.request('/gathering-spots/7', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gatheringSpotName: '第2集合場所' }),
    });

    expect(response.status).toBe(200);
    expect(gatheringSpotService.updateGatheringSpot).toHaveBeenCalledWith(7, {
      gathering_spot_name: '第2集合場所',
    });
  });
});
