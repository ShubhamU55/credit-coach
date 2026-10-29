import { describe, expect, it, vi } from 'vitest';
import { authenticate } from '../../../functions/explain/auth.ts';

const ADVERSARIAL = 50_000;
const BUDGET_MS = 500;

describe('authenticate keeps its URL handling', () => {
  const SUB = '00000000-0000-4000-8000-0000000000aa';
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const token = `${b64({ alg: 'HS256' })}.${b64({ role: 'authenticated', sub: SUB })}.sig`;
  const callWith = async (supabaseUrl: string) => {
    const fetchMock = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify({ id: SUB }), { status: 200 }),
    );
    const started = performance.now();
    await authenticate(
      new Request('https://f.test/explain', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      }),
      { supabaseUrl, anonKey: 'anon', fetchImpl: fetchMock },
    );
    return { url: fetchMock.mock.calls[0]![0], ms: performance.now() - started };
  };

  it('drops every trailing slash and nothing else', async () => {
    expect((await callWith('https://abc.supabase.co///')).url).toBe(
      'https://abc.supabase.co/auth/v1/user',
    );
    expect((await callWith('https://abc.supabase.co/a/b')).url).toBe(
      'https://abc.supabase.co/a/b/auth/v1/user',
    );
  });

  it('is not slow on a URL with tens of thousands of slashes inside it', async () => {
    const url = `https://a${'/'.repeat(ADVERSARIAL)}x`;
    const { ms } = await callWith(url);
    expect(ms).toBeLessThan(BUDGET_MS);
  });
});
