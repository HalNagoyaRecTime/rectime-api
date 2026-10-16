import { describe, expect, it } from 'vitest';
import { createR2ImageUrlSigner } from '../../../src/infrastructure/storages/R2ImageUrlSigner';

const config = {
  bucketUrl: 'https://account.r2.cloudflarestorage.com/rectime-images',
  accessKeyId: 'access-key-id',
  secretAccessKey: 'secret-access-key',
};

function signAt(isoDateTime: string) {
  return createR2ImageUrlSigner(config, () => new Date(isoDateTime)).sign(
    'venues/1/a.png'
  );
}

describe('R2ImageUrlSigner', () => {
  it('画像のキーに、日本時間のその日の0時から7日間有効な署名を付けたバケットのURLを返す', async () => {
    const url = new URL(await signAt('2026-10-14T01:30:00Z'));

    expect(url.origin + url.pathname).toBe(
      'https://account.r2.cloudflarestorage.com/rectime-images/venues/1/a.png'
    );
    expect(url.searchParams.get('X-Amz-Date')).toBe('20261013T150000Z');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('604800');
    expect(url.searchParams.get('X-Amz-Credential')).toBe(
      'access-key-id/20261013/auto/s3/aws4_request'
    );
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('日本時間で同じ日なら、朝9時をまたいでも同じURLを返す', async () => {
    expect(await signAt('2026-10-13T15:00:00Z')).toBe(
      await signAt('2026-10-14T14:59:59Z')
    );
  });

  it('日本時間で日付が変わるとURLも変わる', async () => {
    expect(await signAt('2026-10-14T14:59:59Z')).not.toBe(
      await signAt('2026-10-14T15:00:00Z')
    );
  });
});
