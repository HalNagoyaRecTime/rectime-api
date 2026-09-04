export interface TeamEntity {
  team_id: number;
  team_name: string;
}

// クラス名変更や編成名自体の更新には追随しない。編成名を更新する経路は
// 現状存在しないため、実態とずれた場合の修正手段は編成管理機能の追加を待つ。
export function buildProvisionalTeamName(params: {
  className: string;
  classCode: string;
}): string {
  return `${params.className}(${params.classCode})`;
}
