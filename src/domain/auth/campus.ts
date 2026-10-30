// 三校で同じソースを動かすため、学校コードの一覧はここだけで定義する。
// Envの検証や学校の判定は、すべてこの一覧から作る。
export const CAMPUSES = ['NAGOYA', 'OSAKA', 'TOKYO'] as const;

export type Campus = (typeof CAMPUSES)[number];

// 設定値の表記揺れ(Osaka など)を別の学校として扱わないよう、完全一致だけを認める。
export function parseCampus(value: string | undefined): Campus | null {
  return CAMPUSES.find(campus => campus === value) ?? null;
}
