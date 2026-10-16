import type { R2Bucket } from '@cloudflare/workers-types';
import { IImageStorage } from '../../domain/interfaces/storages/IImageStorage';

export function createR2ImageStorage(bucket: R2Bucket): IImageStorage {
  return {
    async put(key, body, contentType) {
      await bucket.put(key, body, { httpMetadata: { contentType } });
    },

    async delete(key) {
      await bucket.delete(key);
    },
  };
}
