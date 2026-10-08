export interface IImageStorage {
  put: (key: string, body: ArrayBuffer, contentType: string) => Promise<void>;
  delete: (key: string) => Promise<void>;
}
