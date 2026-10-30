// Turns an audit_log row's old_data / new_data into readable "field: before -> after" lines.

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';
export type DiffLine = { field: string; before: string; after: string };
type Json = Record<string, unknown>;

const NONE = '(none)';
// Stamped by the touch trigger on every edit; not a change worth showing.
const STAMP_FIELDS = new Set(['updated_at', 'updated_by']);

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return NONE;
  if (Array.isArray(v)) return v.map((x) => formatValue(x)).join(', ');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

export function shortId(id: string | null): string {
  return id ? id.slice(0, 8) : 'system';
}

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** One line per changed field; an object (predictor_weights) is split into one line per key. */
function diffField(field: string, before: unknown, after: unknown): DiffLine[] {
  if (sameValue(before, after)) return [];
  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
    return keys.flatMap((k) => diffField(`${field}.${k}`, before[k], after[k]));
  }
  return [{ field, before: formatValue(before), after: formatValue(after) }];
}

export function diffAudit(
  action: AuditAction,
  oldData: Json | null,
  newData: Json | null,
): DiffLine[] {
  // INSERT has no old row and DELETE has no new row, so every field is listed.
  const before = action === 'INSERT' ? {} : (oldData ?? {});
  const after = action === 'DELETE' ? {} : (newData ?? {});
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return fields
    .filter((f) => !STAMP_FIELDS.has(f))
    .flatMap((f) => diffField(f, before[f], after[f]));
}
