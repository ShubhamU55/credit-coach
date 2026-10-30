import { afterEach, describe, expect, it, vi } from 'vitest';
import { authenticate, AUTH_TIMEOUT_MS } from '../../../functions/explain/auth.ts';

const SUB = '00000000-0000-4000-8000-0000000000aa';
const SUPABASE_URL = 'https://abc.supabase.co';
const ANON = 'anon-key-placeholder';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** A token with the right shape; the signature is not checked here (the gateway does that). */
const jwt = (claims: Record<string, unknown>) => `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;

const request = (token?: string) =>
  new Request('https://f.test/explain', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

const userReply =
  (body: unknown, status = 200) =>
  async () =>
    new Response(JSON.stringify(body), { status });

const run = (req: Request, fetchImpl: typeof fetch, over = {}) =>
  authenticate(req, { supabaseUrl: SUPABASE_URL, anonKey: ANON, fetchImpl, ...over });

describe('authenticate', () => {
  it('accepts a real user and asks Supabase Auth to confirm the session', async () => {
    const fetchMock = vi.fn<typeof fetch>(userReply({ id: SUB, is_anonymous: false }));
    const token = jwt({ role: 'authenticated', sub: SUB });

    const result = await run(request(token), fetchMock);

    expect(result).toEqual({ ok: true, userId: SUB });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${SUPABASE_URL}/auth/v1/user`);
    expect(init!.headers).toEqual({ apikey: ANON, authorization: `Bearer ${token}` });
  });

  it('accepts an anonymous sign-in user ("Try sample profile")', async () => {
    const fetchMock = vi.fn<typeof fetch>(userReply({ id: SUB, is_anonymous: true }));
    const token = jwt({ role: 'authenticated', sub: SUB, is_anonymous: true });

    expect(await run(request(token), fetchMock)).toEqual({ ok: true, userId: SUB });
  });

  it('refuses the bare anon key (role anon) without any network call', async () => {
    const fetchMock = vi.fn<typeof fetch>(userReply({}));

    const result = await run(request(jwt({ role: 'anon' })), fetchMock);

    expect(result).toEqual({ ok: false, reason: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['no header', undefined],
    ['not a JWT', 'abc'],
    ['two parts', 'aaa.bbb'],
    ['garbage payload', 'aaa.@@@.ccc'],
    ['service role', jwt({ role: 'service_role', sub: SUB })],
    ['no sub', jwt({ role: 'authenticated' })],
    ['sub is not a uuid', jwt({ role: 'authenticated', sub: 'admin' })],
    ['sub is a number', jwt({ role: 'authenticated', sub: 5 })],
  ])('refuses %s without a network call', async (_name, token) => {
    const fetchMock = vi.fn<typeof fetch>(userReply({}));

    const result = await run(request(token), fetchMock);

    expect(result).toEqual({ ok: false, reason: 'unauthenticated' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a Basic header, an extra word and a lower-case scheme', async () => {
    const fetchMock = vi.fn<typeof fetch>(userReply({}));
    const token = jwt({ role: 'authenticated', sub: SUB });

    for (const authorization of [`Basic ${token}`, `Bearer ${token} extra`, `bearer ${token}`]) {
      const req = new Request('https://f.test/x', { headers: { authorization } });
      expect(await run(req, fetchMock)).toEqual({ ok: false, reason: 'unauthenticated' });
    }
  });

  it('refuses a token Supabase Auth rejects (revoked, expired, deleted user)', async () => {
    for (const status of [401, 403]) {
      const fetchMock = vi.fn<typeof fetch>(userReply({ msg: 'bad' }, status));
      const result = await run(request(jwt({ role: 'authenticated', sub: SUB })), fetchMock);
      expect(result).toEqual({ ok: false, reason: 'unauthenticated' });
    }
  });

  it('refuses a session whose confirmed user id differs from the token sub', async () => {
    const other = '00000000-0000-4000-8000-0000000000bb';
    const fetchMock = vi.fn<typeof fetch>(userReply({ id: other }));

    const result = await run(request(jwt({ role: 'authenticated', sub: SUB })), fetchMock);

    expect(result).toEqual({ ok: false, reason: 'unauthenticated' });
  });

  it('reports "unavailable" when Auth errors, is unreachable, or answers nonsense', async () => {
    const token = jwt({ role: 'authenticated', sub: SUB });
    const cases: (typeof fetch)[] = [
      userReply({}, 500),
      userReply({}, 502),
      async () => {
        throw new TypeError('fetch failed');
      },
      async () => new Response('not json', { status: 200 }),
    ];
    for (const impl of cases) {
      const result = await run(request(token), vi.fn<typeof fetch>(impl));
      expect(result).toEqual({ ok: false, reason: 'unavailable' });
    }
  });

  it('reports "unavailable" when the function has no Supabase URL or anon key configured', async () => {
    const fetchMock = vi.fn<typeof fetch>(userReply({}));
    const req = request(jwt({ role: 'authenticated', sub: SUB }));
    const unavailable = { ok: false, reason: 'unavailable' };

    expect(await run(req, fetchMock, { supabaseUrl: undefined })).toEqual(unavailable);
    expect(await run(req, fetchMock, { anonKey: undefined })).toEqual(unavailable);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('gives up after its short budget when Auth never answers', async () => {
    vi.useFakeTimers();
    try {
      const fetchMock = vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
      const pending = run(request(jwt({ role: 'authenticated', sub: SUB })), fetchMock);

      await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS);

      expect(await pending).toEqual({ ok: false, reason: 'unavailable' });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('never puts the token in a result', async () => {
    const token = jwt({ role: 'authenticated', sub: SUB });
    const result = await run(request(token), vi.fn<typeof fetch>(userReply({ id: SUB })));

    expect(JSON.stringify(result)).not.toContain(token);
  });

  describe('budget and diagnostics', () => {
    const hang = () =>
      vi.fn<typeof fetch>(
        (_url, init) =>
          new Promise<Response>((_resolve, reject) => {
            init!.signal!.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      );
    const slow = (ms: number, id: string) =>
      vi.fn<typeof fetch>(
        () =>
          new Promise<Response>((resolve) => {
            setTimeout(() => resolve(new Response(JSON.stringify({ id }), { status: 200 })), ms);
          }),
      );
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    afterEach(() => {
      vi.useRealTimers();
      warn.mockClear();
    });

    it('allows 1500 ms for the lookup', () => {
      expect(AUTH_TIMEOUT_MS).toBe(1500);
    });

    it('still succeeds when Auth answers slowly but inside the budget (1200 ms)', async () => {
      vi.useFakeTimers();
      const pending = run(request(jwt({ role: 'authenticated', sub: SUB })), slow(1200, SUB));
      await vi.advanceTimersByTimeAsync(1200);
      expect(await pending).toEqual({ ok: true, userId: SUB });
      expect(warn).not.toHaveBeenCalled();
    });

    it('gives up as unavailable when Auth answers after the budget (1501 ms)', async () => {
      vi.useFakeTimers();
      const fetchMock = hang();
      const pending = run(request(jwt({ role: 'authenticated', sub: SUB })), fetchMock);
      await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS - 1);
      expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(await pending).toEqual({ ok: false, reason: 'unavailable' });
    });

    it('logs one reason-only line for a timeout, with no token', async () => {
      vi.useFakeTimers();
      const token = jwt({ role: 'authenticated', sub: SUB });
      const pending = run(request(token), hang());
      await vi.advanceTimersByTimeAsync(AUTH_TIMEOUT_MS);
      await pending;
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('explain auth unavailable timeout');
      expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(ANON);
    });

    it('logs http_<status> for a failing Auth service, with no body or token', async () => {
      const token = jwt({ role: 'authenticated', sub: SUB });
      await run(request(token), vi.fn<typeof fetch>(userReply({ secret: 'body-text' }, 502)));
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn).toHaveBeenCalledWith('explain auth unavailable http_502');
      expect(JSON.stringify(warn.mock.calls)).not.toContain('body-text');
      expect(JSON.stringify(warn.mock.calls)).not.toContain(token);
    });

    it('logs no_config when the function environment is incomplete', async () => {
      await run(request(jwt({ role: 'authenticated', sub: SUB })), vi.fn<typeof fetch>(), {
        anonKey: undefined,
      });
      expect(warn).toHaveBeenCalledWith('explain auth unavailable no_config');
    });

    it('logs network for any other transport failure', async () => {
      await run(
        request(jwt({ role: 'authenticated', sub: SUB })),
        vi.fn<typeof fetch>(async () => {
          throw new TypeError('connection reset');
        }),
      );
      expect(warn).toHaveBeenCalledWith('explain auth unavailable network');
    });

    it('does not log for a rejected caller', async () => {
      await run(request(), vi.fn<typeof fetch>());
      expect(warn).not.toHaveBeenCalled();
    });
  });
});
