import { normalizeMicrosoftEmail } from './email';

// 三校で同じソースを動かすため、学校コードの一覧はここだけで定義する。
// Envの検証や学校の判定は、すべてこの一覧から作る。
export const CAMPUSES = ['NAGOYA', 'OSAKA', 'TOKYO'] as const;

export type Campus = (typeof CAMPUSES)[number];

// 設定値の表記揺れ(Osaka など)を別の学校として扱わないよう、完全一致だけを認める。
export function parseCampus(value: string | undefined): Campus | null {
  return CAMPUSES.find(campus => campus === value) ?? null;
}

// 学生・教員のメールドメインと学校の対応表。
const CAMPUS_BY_EMAIL_DOMAIN: Record<string, Campus> = {
  'nhs.hal.ac.jp': 'NAGOYA',
  'nh.hal.ac.jp': 'NAGOYA',
  'ohs.hal.ac.jp': 'OSAKA',
  'oh.hal.ac.jp': 'OSAKA',
  'ths.hal.ac.jp': 'TOKYO',
  'th.hal.ac.jp': 'TOKYO',
};

// nhとnhsの取り違えやサブドメイン・類似ドメインの誤判定を防ぐため、ドメインは完全一致で照合する。
// 判定できないユーザー(外部ユーザーなど)は名古屋校として扱う。
export function resolveCampusFromEmail(
  email: string | null | undefined
): Campus {
  const normalized = email ? normalizeMicrosoftEmail(email) : null;
  if (!normalized) {
    return 'NAGOYA';
  }
  const domain = normalized.split('@')[1];
  return (domain ? CAMPUS_BY_EMAIL_DOMAIN[domain] : undefined) ?? 'NAGOYA';
}
