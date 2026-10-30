import { MARK_PAID_SHEET_OPTIONS } from './markPaidSheetOptions';

describe('mark-paid formSheet options', () => {
  it('is a formSheet', () => {
    expect(MARK_PAID_SHEET_OPTIONS.presentation).toBe('formSheet');
  });

  it('opens at a detent of at least 0.85 so Confirm clears a 3-button navigation bar', () => {
    const detents = MARK_PAID_SHEET_OPTIONS.sheetAllowedDetents;
    const index = MARK_PAID_SHEET_OPTIONS.sheetInitialDetentIndex;
    expect(index).toBe(0);
    expect(detents[index]).toBeGreaterThanOrEqual(0.85);
  });

  it('allows only detents in ascending order up to full height', () => {
    const detents = MARK_PAID_SHEET_OPTIONS.sheetAllowedDetents;
    expect([...detents].sort((a, b) => a - b)).toEqual(detents);
    expect(detents[detents.length - 1]).toBe(1);
  });
});
