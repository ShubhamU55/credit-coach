// Entry point for `supabase functions deploy explain` (Deno). All logic is in handler.ts.
// The Anthropic key comes only from the function secret ANTHROPIC_API_KEY (see supabase/OWNER-STEPS.md);
// it is never in the repository.

import { handleExplain } from './handler.ts';

// Supplied by the Supabase Edge runtime (Deno); declared so the Node typecheck accepts this file.
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Response | Promise<Response>): unknown;
};

Deno.serve((request: Request) =>
  handleExplain(request, {
    apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
    fetchImpl: fetch,
  }),
);
