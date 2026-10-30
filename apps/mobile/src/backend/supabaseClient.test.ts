import { createDemoRepository } from '../demo/repository';
import { getBackendClient, resetBackendClient } from './client';
import { startBackend } from './start';
import { getAccessToken, setAccessToken } from './session';

// The real supabase-js against a fake fetch (no network), with React Native's own partial URL
// class swapped in for Node's. Without the polyfill that getBackendClient installs, createClient
// throws here ("Cannot set property protocol ... only a getter"), which is what happens on device.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactNativeUrl = require('react-native/Libraries/Blob/URL') as {
  URL: typeof URL;
  URLSearchParams: typeof URLSearchParams;
};

const CONFIG = { url: 'https://abc.supabase.co', anonKey: 'anon-key' };

function jwt(claims: object): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS256' })}.${part(claims)}.sig`;
}

describe('supabase-js with the React Native URL class and a fake network', () => {
  const nodeFetch = global.fetch;
  const NodeUrl = global.URL;
  const NodeSearchParams = global.URLSearchParams;
  const requests: { method: string; url: string }[] = [];

  beforeEach(() => {
    setAccessToken(undefined);
    requests.length = 0;
    global.URL = ReactNativeUrl.URL;
    global.URLSearchParams = ReactNativeUrl.URLSearchParams;
    global.fetch = fakeFetch;
    resetBackendClient();
  });
  afterEach(async () => {
    await (
      getBackendClient(CONFIG).auth as unknown as { stopAutoRefresh(): Promise<void> }
    ).stopAutoRefresh();
    resetBackendClient();
    global.URL = NodeUrl;
    global.URLSearchParams = NodeSearchParams;
    global.fetch = nodeFetch;
  });

  const fakeFetch: typeof fetch = (async (input: unknown, init?: { method?: string }) => {
    const url = String(input);
    requests.push({ method: init?.method ?? 'GET', url });
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    if (url.includes('/auth/v1/signup')) {
      const user = { id: '2b5f0c1e-0000-4000-8000-000000000001', is_anonymous: true };
      return json({
        access_token: jwt({ sub: user.id, role: 'authenticated', exp: 4_102_444_800 }),
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'refresh',
        user,
      });
    }
    if (url.includes('/rest/v1/coach_rules')) {
      return json({
        id: 1,
        threshold_pct: 25,
        excellent_pct: 10,
        reporting_basis: 'statement',
        pay_by_buffer_days: 1,
        planner_step_order: ['overdue', 'minimum', 'statement', 'prepay'],
        guard_min_hard_inquiries: 2,
      });
    }
    return new Response('{}', { status: 404 });
  }) as unknown as typeof fetch;

  it('signs in anonymously, reads the rules row and applies it (the URL polyfill is installed by the client)', async () => {
    const repository = createDemoRepository();

    await startBackend({ repository, config: CONFIG });

    expect(getAccessToken()).toBeDefined();
    expect(repository.getRules().thresholdPct).toBe(25);
    expect(requests.map((r) => r.method)).toEqual(['POST', 'GET']);
    const rulesRequest = requests[1]!.url;
    expect(rulesRequest).toContain('https://abc.supabase.co/rest/v1/coach_rules');
    expect(rulesRequest).toContain('id=eq.1');
  });
});
