import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createR2ImageStorage } from '../../../src/infrastructure/storages/R2ImageStorage';

describe('R2ImageStorage', () => {
  const storage = createR2ImageStorage(env.IMAGES);

  it('画像を種類つきで保存して取り出し、削除できる', async () => {
    await storage.put(
      'test/storage.png',
      new Uint8Array([1, 2, 3]).buffer,
      'image/png'
    );

    const saved = await storage.get('test/storage.png');
    expect(saved?.contentType).toBe('image/png');
    expect(
      new Uint8Array(await new Response(saved!.body).arrayBuffer())
    ).toEqual(new Uint8Array([1, 2, 3]));

    await storage.delete('test/storage.png');
    expect(await storage.get('test/storage.png')).toBeNull();
  });
});
