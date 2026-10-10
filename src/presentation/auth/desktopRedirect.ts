// Desktopは動的ポートのlocalhostだけを許可し、Web用の戻り先と区別する。
export function isDesktopRedirectUri(value: string): boolean {
  try {
    const uri = new URL(value);
    return (
      uri.protocol === 'http:' &&
      uri.hostname === 'localhost' &&
      Number(uri.port) >= 1024 &&
      Number(uri.port) <= 65535 &&
      uri.pathname === '/auth/callback' &&
      !uri.username &&
      !uri.password &&
      !uri.search &&
      !uri.hash &&
      uri.href === value
    );
  } catch {
    return false;
  }
}
