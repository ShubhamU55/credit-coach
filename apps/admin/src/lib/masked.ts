// The admin panel renders PAN and mobile only when they have the masked shape the database CHECK
// constraints enforce. Anything else (a full PAN, an unmasked number) is replaced by a placeholder
// and never echoed (CLAUDE.md non-negotiable 5).

const PAN_MASKED = /^[A-Z]{2}X{5}\d{2}[A-Z]$/;
const MOBILE_MASKED = /^\+91 \d{2}X{5}\d{3}$/;
const HIDDEN = '(hidden: not masked)';

export function safeMaskedPan(v: unknown): string {
  return typeof v === 'string' && PAN_MASKED.test(v) ? v : HIDDEN;
}

export function safeMaskedMobile(v: unknown): string {
  return typeof v === 'string' && MOBILE_MASKED.test(v) ? v : HIDDEN;
}
