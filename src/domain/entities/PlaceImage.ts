export interface PlaceImage {
  body: ArrayBuffer;
  contentType: string;
}

export interface StoredImage {
  body: ReadableStream;
  contentType: string;
}

export interface PlaceImageKey {
  imageKey: string | null;
}
