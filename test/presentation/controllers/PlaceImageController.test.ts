import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { IPlaceImageService } from '../../../src/application/services/IPlaceImageService';
import { createPlaceImageController } from '../../../src/presentation/controllers/PlaceImageController';

function setup() {
  const placeImageService: IPlaceImageService = {
    setVenueImage: vi.fn(),
    deleteVenueImage: vi.fn(),
    setGatheringSpotImage: vi.fn(),
    deleteGatheringSpotImage: vi.fn(),
  };
  const controller = createPlaceImageController(placeImageService);
  const app = new Hono();
  app.put('/venues/:venueId/image', c => controller.putVenueImage(c));
  app.delete('/venues/:venueId/image', c => controller.deleteVenueImage(c));
  app.put('/gathering-spots/:gatheringSpotId/image', c =>
    controller.putGatheringSpotImage(c)
  );
  app.delete('/gathering-spots/:gatheringSpotId/image', c =>
    controller.deleteGatheringSpotImage(c)
  );
  return { app, placeImageService };
}

function putImage(app: Hono, path: string) {
  return app.request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'image/png' },
    body: new Uint8Array([1, 2, 3]),
  });
}

describe('PlaceImageController', () => {
  it('実施場所の画像を本文と Content-Type のまま渡し、204を返す', async () => {
    const { app, placeImageService } = setup();

    const response = await putImage(app, '/venues/1/image');

    expect(response.status).toBe(204);
    const [venueId, image] = vi.mocked(placeImageService.setVenueImage).mock
      .calls[0];
    expect(venueId).toBe(1);
    expect(image.contentType).toBe('image/png');
    expect(new Uint8Array(image.body)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('不正な画像は400を返す', async () => {
    const { app, placeImageService } = setup();
    vi.mocked(placeImageService.setVenueImage).mockRejectedValue(
      new Error('Invalid image')
    );

    const response = await putImage(app, '/venues/1/image');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_PLACE_IMAGE' },
    });
  });

  it('存在しない実施場所は404を返す', async () => {
    const { app, placeImageService } = setup();
    vi.mocked(placeImageService.setVenueImage).mockRejectedValue(
      new Error('Venue not found')
    );

    const response = await putImage(app, '/venues/1/image');

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'VENUE_NOT_FOUND' },
    });
  });

  it('不正な実施場所IDは400を返す', async () => {
    const { app, placeImageService } = setup();

    const response = await putImage(app, '/venues/abc/image');

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_VENUE_ID' },
    });
    expect(placeImageService.setVenueImage).not.toHaveBeenCalled();
  });

  it('集合場所の画像を登録し、204を返す', async () => {
    const { app, placeImageService } = setup();

    const response = await putImage(app, '/gathering-spots/2/image');

    expect(response.status).toBe(204);
    expect(placeImageService.setGatheringSpotImage).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ contentType: 'image/png' })
    );
  });

  it('存在しない集合場所の画像削除は404を返す', async () => {
    const { app, placeImageService } = setup();
    vi.mocked(placeImageService.deleteGatheringSpotImage).mockRejectedValue(
      new Error('Gathering spot not found')
    );

    const response = await app.request('/gathering-spots/2/image', {
      method: 'DELETE',
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: 'GATHERING_SPOT_NOT_FOUND' },
    });
  });

  it('実施場所の画像を削除し、204を返す', async () => {
    const { app, placeImageService } = setup();

    const response = await app.request('/venues/1/image', {
      method: 'DELETE',
    });

    expect(response.status).toBe(204);
    expect(placeImageService.deleteVenueImage).toHaveBeenCalledWith(1);
  });
});
