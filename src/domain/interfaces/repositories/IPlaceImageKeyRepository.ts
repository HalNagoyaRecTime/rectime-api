export interface IPlaceImageKeyRepository {
  isInUse: (imageKey: string) => Promise<boolean>;
}
