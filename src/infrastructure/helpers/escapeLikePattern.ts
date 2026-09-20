// LIKE検索の対象文字列に % や _ そのものが含まれていても、ワイルドカードとして
// 展開されず文字通りに一致するよう、SQLiteの ESCAPE 句と組み合わせて使う。
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, char => `\\${char}`);
}
