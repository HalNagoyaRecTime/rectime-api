import { StoredImage } from '../../entities/PlaceImage';

export interface IImageStorage {
  get: (key: string) => Promise<StoredImage | null>;
  put: (key: string, body: ArrayBuffer, contentType: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}
