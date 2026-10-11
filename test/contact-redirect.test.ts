import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

import { app } from '../src/index';

const FORM_URL = 'https://forms.example.com/r/contact';

function request(path: string, contactFormUrl?: string) {
  return app.fetch(new Request(`http://example.com${path}`), {
    ...env,
    CONTACT_FORM_URL: contactFormUrl,
  });
}

describe('GET /app/contact', () => {
  it('認証なしで設定されたフォームへ302リダイレクトする', async () => {
    const res = await request('/app/contact', FORM_URL);

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(FORM_URL);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('クエリでリダイレクト先を変更できない', async () => {
    const res = await request(
      '/app/contact?url=https://evil.example&redirect=https://evil.example',
      FORM_URL
    );

    expect(res.status).toBe(302);
    expect(res.headers.get('Location')).toBe(FORM_URL);
  });

  it.each([
    ['未設定', undefined],
    ['空文字', ''],
    ['URLとして不正', 'not-a-url'],
    ['http', 'http://forms.example.com/r/contact'],
    ['javascript', 'javascript:alert(1)'],
  ])('%sの場合はリダイレクトせず503のHTMLを返す', async (_name, value) => {
    const res = await request('/app/contact', value);

    expect(res.status).toBe(503);
    expect(res.headers.get('Location')).toBeNull();
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain(
      '現在お問い合わせフォームを利用できません'
    );
  });
});
