import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IVenueService } from '../../../src/application/services/IVenueService';
import { createVenueController } from '../../../src/presentation/controllers/VenueController';

function setup() {
  const venueService: IVenueService = {
    getAllVenues: vi.fn(),
    getVenuePage: vi.fn(),
    createVenue: vi.fn(),
    updateVenue: vi.fn(),
    deleteVenue: vi.fn(),
  };
  const controller = createVenueController(venueService);
  const app = new Hono();
  app.get('/venues', c => controller.getAllVenues(c));
  app.post('/venues', c => controller.createVenue(c));
  app.put('/venues/:venueId', c => controller.updateVenue(c));
  app.delete('/venues/:venueId', c => controller.deleteVenue(c));
  return { app, venueService };
}

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

describe('VenueController', () => {
  it('クエリなしの一覧は配列を返す', async () => {
    const { app, venueService } = setup();
    mocked(venueService.getAllVenues).mockResolvedValue([]);

    const response = await app.request('/venues');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([]);
    expect(venueService.getVenuePage).not.toHaveBeenCalled();
  });

  it('クエリ付きの一覧は検索・ページネーションを委譲する', async () => {
    const { app, venueService } = setup();
    mocked(venueService.getVenuePage).mockResolvedValue({
      venues: [],
      total: 0,
      limit: 20,
      offset: 0,
    });

    const response = await app.request(
      '/venues?name=体育&limit=20&sortBy=name&sortOrder=desc'
    );

    expect(response.status).toBe(200);
    expect(venueService.getVenuePage).toHaveBeenCalledWith({
      name: '体育',
      limit: 20,
      offset: 0,
      sortBy: 'name',
      sortOrder: 'desc',
    });
  });

  it('検索条件が不正なら400を返す', async () => {
    const { app } = setup();

    const response = await app.request('/venues?limit=0');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_VENUE_LIST_QUERY' },
    });
  });

  it('実施場所を作成し、201を返す', async () => {
    const { app, venueService } = setup();
    mocked(venueService.createVenue).mockResolvedValue({ venue_id: 1 });

    const response = await app.request('/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName: '第1体育館' }),
    });

    expect(response.status).toBe(201);
    expect(venueService.createVenue).toHaveBeenCalledWith('第1体育館');
  });

  it('空の名前では400を返す', async () => {
    const { app, venueService } = setup();

    const response = await app.request('/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName: '   ' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_VENUE_REQUEST' },
    });
    expect(venueService.createVenue).not.toHaveBeenCalled();
  });

  it('名前が重複した作成は409を返す', async () => {
    const { app, venueService } = setup();
    mocked(venueService.createVenue).mockRejectedValue(
      new Error('Venue name already exists')
    );

    const response = await app.request('/venues', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName: '第1体育館' }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'VENUE_NAME_ALREADY_EXISTS' },
    });
  });

  it('実施場所を更新する', async () => {
    const { app, venueService } = setup();
    mocked(venueService.updateVenue).mockResolvedValue({ venue_id: 1 });

    const response = await app.request('/venues/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName: '第2体育館' }),
    });

    expect(response.status).toBe(200);
    expect(venueService.updateVenue).toHaveBeenCalledWith(1, {
      venue_name: '第2体育館',
    });
  });

  it('IDが不正なら400を返す', async () => {
    const { app, venueService } = setup();

    const response = await app.request('/venues/abc', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName: '第2体育館' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_VENUE_ID' },
    });
    expect(venueService.updateVenue).not.toHaveBeenCalled();
  });

  it('更新対象が無ければ404を返す', async () => {
    const { app, venueService } = setup();
    mocked(venueService.updateVenue).mockRejectedValue(
      new Error('Venue not found')
    );

    const response = await app.request('/venues/1', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ venueName: '第2体育館' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'VENUE_NOT_FOUND' },
    });
  });

  it('実施場所を削除し、204を返す', async () => {
    const { app, venueService } = setup();
    mocked(venueService.deleteVenue).mockResolvedValue(undefined);

    const response = await app.request('/venues/1', { method: 'DELETE' });

    expect(response.status).toBe(204);
    expect(venueService.deleteVenue).toHaveBeenCalledWith(1);
  });

  it('競技から参照されている実施場所の削除は409を返す', async () => {
    const { app, venueService } = setup();
    mocked(venueService.deleteVenue).mockRejectedValue(
      new Error('Venue is in use')
    );

    const response = await app.request('/venues/1', { method: 'DELETE' });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'VENUE_IN_USE' },
    });
  });

  it('削除対象が無ければ404を返す', async () => {
    const { app, venueService } = setup();
    mocked(venueService.deleteVenue).mockRejectedValue(
      new Error('Venue not found')
    );

    const response = await app.request('/venues/1', { method: 'DELETE' });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'VENUE_NOT_FOUND' },
    });
  });
});
