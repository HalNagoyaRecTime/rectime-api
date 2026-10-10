import type { R2Bucket } from '@cloudflare/workers-types';
import { IImageStorage } from '../../domain/interfaces/storages/IImageStorage';

export function createR2ImageStorage(bucket: R2Bucket): IImageStorage {
  return {
    async get(key) {
      const object = await bucket.get(key);
      if (!object) return null;
      return {
        body: object.body as unknown as ReadableStream,
        contentType:
          object.httpMetadata?.contentType ?? 'application/octet-stream',
      };
    },

    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },

    async delete(key) {
      await bucket.delete(key);
    },
  };
}
