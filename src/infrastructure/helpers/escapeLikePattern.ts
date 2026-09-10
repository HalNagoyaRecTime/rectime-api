// LIKE検索でワイルドカードを文字として扱うためにエスケープする。
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}
