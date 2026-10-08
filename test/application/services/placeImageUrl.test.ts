import { describe, expect, it } from 'vitest';
import {
  gatheringSpotImageUrl,
  venueImageUrl,
} from '../../../src/application/services/placeImageUrl';

describe('placeImageUrl', () => {
  it('画像のある実施場所は、画像のファイル名つきの取得URLを返す', () => {
    expect(venueImageUrl(1, 'venues/1/3f9a.webp')).toBe(
      '/api/v1/venues/1/image?v=3f9a.webp'
    );
  });

  it('画像のある集合場所は、集合場所の取得URLを返す', () => {
    expect(gatheringSpotImageUrl(2, 'gathering-spots/2/abcd.png')).toBe(
      '/api/v1/gathering-spots/2/image?v=abcd.png'
    );
  });

  it('画像が無い場所は null を返す', () => {
    expect(venueImageUrl(1, null)).toBeNull();
  });
});
