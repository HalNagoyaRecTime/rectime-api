import { toBase64URL } from './base64url';

export function generateRandom(byteLength: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return toBase64URL(bytes);
}

export async function generateCodeChallenge(
  codeVerifier: string
): Promise<string> {
  const data = new TextEncoder().encode(codeVerifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return toBase64URL(new Uint8Array(hash));
}
