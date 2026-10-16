export interface IImageUrlSigner {
  sign: (imageKey: string) => Promise<string>;
}
