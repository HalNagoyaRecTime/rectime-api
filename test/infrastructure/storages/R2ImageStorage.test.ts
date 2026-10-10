import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createR2ImageStorage } from '../../../src/infrastructure/storages/R2ImageStorage';

describe('R2ImageStorage', () => {
  const storage = createR2ImageStorage(env.IMAGES);

  it('画像を種類つきで保存し、削除できる', async () => {
    await storage.put(
      'test/storage.png',
      new Uint8Array([1, 2, 3]).buffer,
      'image/png'
    );

    const saved = await env.IMAGES.get('test/storage.png');
    expect(saved?.httpMetadata?.contentType).toBe('image/png');
    expect(new Uint8Array(await saved!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3])
    );

    await storage.delete('test/storage.png');
    expect(await env.IMAGES.get('test/storage.png')).toBeNull();
  });
});
