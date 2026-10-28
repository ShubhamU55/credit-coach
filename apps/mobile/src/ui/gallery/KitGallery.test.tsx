import * as fs from 'fs';
import * as path from 'path';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { KitGallery } from './KitGallery';

const hidden = { includeHiddenElements: true } as const;

const SECTIONS = [
  'kit-buttons',
  'kit-form',
  'kit-info',
  'kit-cards',
  'kit-plan',
  'kit-score',
  'kit-chrome',
];

describe('KitGallery', () => {
  test.each(SECTIONS)('has the section %s that the Maestro flow scrolls to', async (id) => {
    await render(<KitGallery />);

    expect(screen.getByTestId(id, hidden)).toBeOnTheScreen();
  });

  test('keeps "Credit Coach" and the engine check at the top so smoke.yaml still passes', async () => {
    await render(<KitGallery />);

    expect(screen.getByText('Credit Coach')).toBeOnTheScreen();
    expect(screen.getByTestId('engine-check')).toHaveTextContent('Engine OK: 30%', {
      exact: true,
    });
  });

  test('ends with the fixed disclaimer, last in the scroll content', async () => {
    await render(<KitGallery />);

    const disclaimers = screen.getAllByTestId('disclaimer');
    const last = disclaimers[disclaimers.length - 1];
    const siblings = last.parent?.children ?? [];
    expect(siblings[siblings.length - 1]).toBe(last);
  });

  test('every score range is one line, and shows the en-dash range', async () => {
    await render(<KitGallery />);

    const ranges = screen.getAllByTestId('score-range');
    expect(ranges.length).toBeGreaterThanOrEqual(2);
    for (const range of ranges) {
      expect(range).toHaveProp('numberOfLines', 1);
      expect(range).toHaveTextContent('708–736', { exact: true });
    }
  });

  test('the formatted Aarav figures come from the engine formatters', async () => {
    await render(<KitGallery />);

    expect(screen.getAllByText('₹12,400').length).toBeGreaterThan(0);
    expect(screen.getByText('45.0%')).toBeOnTheScreen();
    expect(screen.getByText('81.0% → 30.0%', hidden)).toBeOnTheScreen();
    expect(screen.getByText('₹74,200 · 4 Nov', hidden)).toBeOnTheScreen();
  });

  test('draws no Due marker for SBI (no due date this cycle) and one each for Axis and HDFC', async () => {
    await render(<KitGallery />);

    const lane = (i: number) =>
      within(screen.getByTestId(`timeline-lane-${i}`, hidden)).queryAllByTestId(
        'due-marker',
        hidden,
      );
    expect(lane(0)).toHaveLength(1); // Axis
    expect(lane(1)).toHaveLength(0); // SBI
    expect(lane(2)).toHaveLength(1); // HDFC
  });

  test('shows each plan step state: one primary, one secondary, one paid', async () => {
    await render(<KitGallery />);

    expect(screen.getByTestId('plan-step-0-mark-paid')).toBeOnTheScreen();
    expect(screen.getByTestId('plan-step-1-mark-paid')).toBeOnTheScreen();
    expect(screen.getByText('✓ PAID · 21 OCT')).toBeOnTheScreen();
  });

  test('marking the primary step paid hands "primary" to the next unpaid step', async () => {
    await render(<KitGallery />);
    const border = (i: number) => screen.getByTestId(`plan-step-${i}-card`, hidden).props.style;

    expect(JSON.stringify(border(0))).toContain('boxShadow');
    expect(JSON.stringify(border(1))).not.toContain('boxShadow');

    await fireEvent.press(screen.getByTestId('plan-step-0-mark-paid'));

    expect(JSON.stringify(border(0))).not.toContain('boxShadow');
    expect(JSON.stringify(border(1))).toContain('boxShadow');
  });

  test('the bottom sheet is closed until the button opens it, then Close shuts it', async () => {
    await render(<KitGallery />);
    expect(screen.queryByText('Axis Neo · due Thu, 22 Oct')).toBeNull();

    await fireEvent.press(screen.getByTestId('kit-open-sheet'));
    expect(
      screen.getByText('This only records it here. Pay in your bank or UPI app.'),
    ).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(
      screen.queryByText('This only records it here. Pay in your bank or UPI app.'),
    ).toBeNull();
  });
});

describe('kit-gallery.yaml', () => {
  // Prettier may rewrite the YAML quotes; compare with one quote style.
  const flow = fs
    .readFileSync(path.join(__dirname, '../../../.maestro/kit-gallery.yaml'), 'utf8')
    .replaceAll("'", '"');

  test.each(SECTIONS)('scrolls to the %s title anchor and takes three screenshots of it', (id) => {
    // Sections are taller than one screen, so the flow anchors on the small title, never the
    // whole section (scrollUntilVisible wants 100% of the element visible).
    expect(flow).toContain(`id: "${id}-title"`);
    expect(flow).not.toContain(`id: "${id}"`);
    for (const n of [1, 2, 3]) {
      expect(flow).toContain(`takeScreenshot: ../../docs/test-reports/ui-kit/${id}-${n}`);
    }
  });

  test('every section the flow scrolls to exists in the gallery', async () => {
    await render(<KitGallery />);

    const ids = [...flow.matchAll(/id: "(kit-[a-z-]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(SECTIONS.length);
    for (const id of new Set(ids)) {
      expect(screen.getByTestId(id, hidden)).toBeOnTheScreen();
    }
  });

  test('asserts the XL score range whole, as the plan requires', () => {
    expect(flow).toContain('id: "kit-range-xl"');
    expect(flow).toContain('text: "708–736"');
  });
});
