// A small local FAKE Supabase for the admin e2e tests (started by Playwright's webServer).
// It speaks just enough GoTrue (password grant, GET /user) and PostgREST (coach_rules GET/PATCH,
// audit_log GET, sample_profiles GET) for the admin app. It mimics two real behaviours on purpose:
//   - RLS: a non-admin PATCH matches zero rows and answers 200 with [] (it is not an error);
//   - CHECK constraints: an out-of-range value answers 400 with code 23514.
// It is test infrastructure only. Nothing here is used by the product.
import http from 'node:http';

const PORT = Number(process.env.FAKE_SUPABASE_PORT ?? 54399);
const ANON_KEY = 'e2e-anon-key';

const USERS = {
  'admin@example.com': {
    id: '11111111-1111-4111-8111-111111111111',
    password: 'admin-pass',
    role: 'admin',
  },
  'viewer@example.com': {
    id: '22222222-2222-4222-8222-222222222222',
    password: 'viewer-pass',
    role: null,
  },
};

const DEFAULT_RULES = {
  id: 1,
  threshold_pct: 30,
  excellent_pct: 10,
  reporting_basis: 'statement',
  pay_by_buffer_days: 1,
  planner_step_order: ['overdue', 'minimum', 'statement', 'prepay'],
  predictor_weights: {
    paymentHistory: 35,
    overallUtilization: 11,
    maxCardUtilization: 11,
    hardInquiries: 12,
    creditAge: 16,
    openAccounts: 7,
    creditMix: 8,
  },
  guard_min_hard_inquiries: 2,
  reminder_prepay_days: 2,
  reminder_due_days: [3, 1],
  updated_at: '2026-10-28T00:00:00Z',
  updated_by: null,
};

const PROFILES = [
  {
    slug: 'aarav',
    persona: 'high_utilizer',
    display_name: 'Aarav Mehta',
    pan_masked: 'ABXXXXX34F',
    mobile_masked: '+91 98XXXXX321',
    score: 720,
    score_date: '2026-10-01',
    is_default: true,
    sort_order: 1,
  },
  {
    // The real database CHECK would refuse this row. It proves the page never renders an unmasked PAN.
    slug: 'leaky',
    persona: 'thin_file',
    display_name: 'Leaky Row',
    pan_masked: 'ABCDE1234F',
    mobile_masked: '+91 9876543210',
    score: 690,
    score_date: '2026-10-01',
    is_default: false,
    sort_order: 2,
  },
];

let rules = structuredClone(DEFAULT_RULES);
let audit = [];
let auditId = 0;

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

function tokenFor(email) {
  const u = USERS[email];
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: u.id,
    email,
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600,
    is_anonymous: false,
    app_metadata: u.role ? { role: u.role } : {},
  };
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.fake-signature`;
}

function claimsOf(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!m) return null;
  try {
    const claims = JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString());
    return claims.exp > Math.floor(Date.now() / 1000) && claims.sub ? claims : null;
  } catch {
    return null;
  }
}

const isAdmin = (claims) => claims?.app_metadata?.role === 'admin';

function userJson(claims) {
  return {
    id: claims.sub,
    aud: 'authenticated',
    role: 'authenticated',
    email: claims.email,
    app_metadata: claims.app_metadata,
    user_metadata: {},
    is_anonymous: false,
    created_at: '2026-10-01T00:00:00Z',
  };
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const text = Buffer.concat(chunks).toString();
  return text ? JSON.parse(text) : {};
}

const inRange = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const STEPS = ['overdue', 'minimum', 'statement', 'prepay'];

// The CHECK constraints from supabase/migrations/20261028100000_core_tables.sql.
function violatedCheck(r) {
  const checks = [
    ['coach_rules_threshold_range', inRange(r.threshold_pct, 5, 50)],
    ['coach_rules_excellent_range', inRange(r.excellent_pct, 1, 30)],
    ['coach_rules_reporting_basis', ['statement', 'weekly_current'].includes(r.reporting_basis)],
    ['coach_rules_buffer_range', inRange(r.pay_by_buffer_days, 0, 7)],
    [
      'coach_rules_step_order',
      Array.isArray(r.planner_step_order) &&
        r.planner_step_order.length === 4 &&
        STEPS.every((s) => r.planner_step_order.includes(s)),
    ],
    ['coach_rules_guard_range', inRange(r.guard_min_hard_inquiries, 1, 10)],
    ['coach_rules_prepay_range', inRange(r.reminder_prepay_days, 0, 14)],
    [
      'coach_rules_due_days',
      Array.isArray(r.reminder_due_days) &&
        r.reminder_due_days.length >= 1 &&
        r.reminder_due_days.length <= 5 &&
        r.reminder_due_days.every((d) => inRange(d, 0, 14)),
    ],
    [
      'coach_rules_predictor_weights',
      typeof r.predictor_weights === 'object' &&
        Object.keys(r.predictor_weights).length === 7 &&
        Object.values(r.predictor_weights).every(
          (w) => typeof w === 'number' && w >= 0 && w <= 100,
        ),
    ],
  ];
  return checks.find(([, ok]) => !ok)?.[0] ?? null;
}

async function passwordGrant(req, res, url) {
  const { email, password } = await readJson(req);
  const u = USERS[email];
  if (url.searchParams.get('grant_type') !== 'password' || !u || u.password !== password) {
    return send(res, 400, {
      error: 'invalid_grant',
      error_description: 'Invalid login credentials',
    });
  }
  const access_token = tokenFor(email);
  const claims = claimsOf({ headers: { authorization: `Bearer ${access_token}` } });
  return send(res, 200, {
    access_token,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: claims.exp,
    refresh_token: 'fake-refresh-token',
    user: userJson(claims),
  });
}

async function patchRules(req, res, claims) {
  if (!claims || !isAdmin(claims)) return send(res, 200, []); // RLS: zero rows, not an error
  const patch = await readJson(req);
  const next = { ...rules, ...patch };
  const bad = violatedCheck(next);
  if (bad) {
    return send(res, 400, {
      code: '23514',
      message: `new row for relation "coach_rules" violates check constraint "${bad}"`,
    });
  }
  const changed = Object.keys(patch).some(
    (k) => JSON.stringify(patch[k]) !== JSON.stringify(rules[k]),
  );
  if (changed) {
    auditId += 1;
    audit.push({
      id: auditId,
      changed_at: new Date().toISOString(),
      actor_id: claims.sub,
      actor_role: 'admin',
      table_name: 'coach_rules',
      action: 'UPDATE',
      row_key: '1',
      old_data: rules,
      new_data: next,
    });
  }
  rules = next;
  return send(res, 200, [rules]);
}

const ROUTES = {
  'POST /auth/v1/token': (req, res, ctx) => passwordGrant(req, res, ctx.url),
  'GET /auth/v1/user': (req, res, ctx) =>
    ctx.claims
      ? send(res, 200, userJson(ctx.claims))
      : send(res, 401, { code: 401, msg: 'invalid JWT' }),
  'GET /rest/v1/coach_rules': (req, res) => send(res, 200, [rules]),
  'PATCH /rest/v1/coach_rules': (req, res, ctx) => patchRules(req, res, ctx.claims),
  'GET /rest/v1/audit_log': (req, res, ctx) =>
    send(res, 200, isAdmin(ctx.claims) ? [...audit].reverse().slice(0, 50) : []),
  'GET /rest/v1/sample_profiles': (req, res) => send(res, 200, PROFILES),
};

async function handle(req, res) {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const route = `${req.method} ${url.pathname}`;

  if (route === 'GET /health') return send(res, 200, { ok: true });
  if (route === 'POST /__reset') {
    rules = structuredClone(DEFAULT_RULES);
    audit = [];
    return send(res, 200, { ok: true });
  }
  if (req.headers.apikey !== ANON_KEY) return send(res, 401, { message: 'Invalid API key' });

  const handler = ROUTES[route];
  if (!handler) return send(res, 404, { message: `fake supabase: no route for ${route}` });
  return handler(req, res, { url, claims: claimsOf(req) });
}

http
  .createServer((req, res) => {
    handle(req, res).catch((e) => send(res, 500, { message: String(e) }));
  })
  .listen(PORT, '127.0.0.1', () => console.log(`fake supabase on ${PORT}`));
