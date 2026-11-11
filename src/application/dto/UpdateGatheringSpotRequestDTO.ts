export interface UpdateGatheringSpotRequestDTO {
  gatheringSpotName: string;
  // 更新時だけ使う。取得時点の lock_version を送り返すと、取得後に変更されていた場合は409になる。
  lockVersion?: number;
}
