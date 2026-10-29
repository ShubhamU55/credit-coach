import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static guards over the SQL and the function folder. They run in `pnpm verify` without Docker;
// the behavioural RLS tests are the pgTAP file in supabase/tests/database (needs the local stack).

const ROOT = new URL('../../../', import.meta.url);
const read = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

function filesUnder(dir: URL): URL[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(entry.name + (entry.isDirectory() ? '/' : ''), dir);
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

const migrations = readdirSync(new URL('migrations/', ROOT))
  .filter((f) => f.endsWith('.sql'))
  .sort();
const allSql = migrations.map((f) => read(`migrations/${f}`)).join('\n');
/** The same SQL without line comments, for checks on what the code does rather than what it says. */
const code = allSql.replace(/--.*$/gm, '');

describe('migrations', () => {
  it('have unique, ordered, timestamped names', () => {
    expect(migrations.length).toBeGreaterThanOrEqual(3);
    for (const name of migrations) expect(name).toMatch(/^\d{14}_[a-z_]+\.sql$/);
    expect(new Set(migrations.map((n) => n.slice(0, 14))).size).toBe(migrations.length);
  });

  it('enable row-level security on every table they create', () => {
    const tables = [...allSql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]!);

    expect(tables.sort()).toEqual(
      [
        'audit_log',
        'cards',
        'coach_rules',
        'consents',
        'payments',
        'profiles',
        'sample_profiles',
      ].sort(),
    );
    for (const table of tables) {
      expect(allSql, `${table} must enable RLS`).toMatch(
        new RegExp(`alter table public\\.${table} enable row level security`),
      );
      expect(allSql, `${table} must have at least one policy`).toMatch(
        new RegExp(`create policy \\w+ on public\\.${table}\\b`),
      );
    }
  });

  it('revoke the default table grants from anon and authenticated before granting', () => {
    expect(allSql).toMatch(/revoke all on public\.profiles[\s\S]*from anon, authenticated/);
    expect(allSql).toMatch(
      /revoke all on function public\.reset_demo_data\(\) from public, anon, authenticated/,
    );
    expect(allSql).toMatch(
      /revoke all on function public\.adopt_sample_profile\(text\) from public, anon, authenticated/,
    );
  });

  it('read the admin role from app_metadata only, never from user-editable metadata', () => {
    expect(code).toContain("auth.jwt() -> 'app_metadata' ->> 'role'");
    expect(code).not.toMatch(/user_metadata/);
  });

  it('make every security definer function pin its search_path', () => {
    const functions = allSql.split(/create function /).slice(1);
    const definers = functions.filter((f) =>
      /security definer/i.test(f.split(/\$\$|\$fn\$/)[0] ?? ''),
    );

    expect(definers.length).toBeGreaterThanOrEqual(3);
    for (const fn of definers) {
      expect(fn.split(/\$\$|\$fn\$/)[0]).toMatch(/set search_path = ''/);
    }
  });

  it('only ever accept a masked PAN', () => {
    // profiles, sample_profiles and consents each carry the CHECK; nothing else stores a PAN.
    const masks = code.match(/pan_masked ~ '\^\[A-Z\]\{2\}X\{5\}\[0-9\]\{2\}\[A-Z\]\$'/g) ?? [];

    expect(masks).toHaveLength(3);
    expect(code).not.toMatch(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
    expect(code).not.toMatch(/\bpan\b\s+(text|varchar)/i);
  });

  it('keep the threshold range at 5 to 50', () => {
    expect(allSql).toMatch(/threshold_pct between 5 and 50/);
  });
});

describe('secrets', () => {
  it('appear nowhere under supabase/ (keys, JWTs, env files)', () => {
    const files = filesUnder(ROOT).filter(
      (f) => !f.pathname.includes('/node_modules/') && !/\.(png|ico)$/.test(f.pathname),
    );
    expect(files.length).toBeGreaterThan(10);
    const thisFile = new URL('tests/functions/explain/migrations.test.ts', ROOT).pathname;

    for (const file of files) {
      if (file.pathname === thisFile) continue;
      const text = readFileSync(file, 'utf8');
      expect(text, file.pathname).not.toMatch(/sk-ant-[A-Za-z0-9_-]{10,}/);
      expect(text, file.pathname).not.toMatch(/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\./);
      expect(text, file.pathname).not.toMatch(/ANTHROPIC_API_KEY\s*=\s*[A-Za-z0-9]/);
    }
    expect(filesUnder(ROOT).some((f) => /\/\.env/.test(f.pathname))).toBe(false);
  });

  it('reach the function only through the ANTHROPIC_API_KEY secret in index.ts', () => {
    const functionFiles = filesUnder(new URL('functions/', ROOT));
    const readers = functionFiles.filter((f) => readFileSync(f, 'utf8').includes('Deno.env.get'));

    expect(readers.map((f) => f.pathname.split('/').pop())).toEqual(['index.ts']);
    expect(read('functions/explain/index.ts')).toContain("Deno.env.get('ANTHROPIC_API_KEY')");
  });
});
