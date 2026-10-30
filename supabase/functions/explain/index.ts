// Entry point for `supabase functions deploy explain` (Deno). All logic is in handler.ts.
// A model key comes only from a function secret, never from the repository: GEMINI_API_KEY (used when
// set) or ANTHROPIC_API_KEY (see supabase/OWNER-STEPS.md). SUPABASE_URL and SUPABASE_ANON_KEY are set by the Edge runtime.

import { authenticate } from './auth.ts';
import { handleExplain } from './handler.ts';
import { createRateLimiter, IP_LIMIT_PER_MINUTE, USER_LIMIT_PER_MINUTE } from './ratelimit.ts';

// Supplied by the Supabase Edge runtime (Deno); declared so the Node typecheck accepts this file.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

const MINUTE_MS = 60_000;
// Module scope: lives as long as this instance does (best effort, see ratelimit.ts).
const userLimiter = createRateLimiter({
  max: USER_LIMIT_PER_MINUTE,
  windowMs: MINUTE_MS,
  now: () => Date.now(),
});
const ipLimiter = createRateLimiter({
  max: IP_LIMIT_PER_MINUTE,
  windowMs: MINUTE_MS,
  now: () => Date.now(),
});

Deno.serve((request: Request) =>
  handleExplain(request, {
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    geminiApiKey: Deno.env.get('GEMINI_API_KEY') || undefined,
    geminiModel: Deno.env.get('GEMINI_MODEL') || undefined,
    fetchImpl: fetch,
    authenticate: (req) =>
      authenticate(req, {
        supabaseUrl: Deno.env.get('SUPABASE_URL'),
        anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
        fetchImpl: fetch,
      }),
    userLimiter,
    ipLimiter,
  }),
);
