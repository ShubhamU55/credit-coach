import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { AccessibilityInfo, BackHandler } from 'react-native';

import aaravSeed from '../../demo/aarav.json';
import ScoreRoute from '../../app/score';
import { createDemoRepository } from '../../demo/repository';
import { parseSeed } from '../../demo/seed';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { CLOSE_CARD_AGE_WARNING, CLOSE_CARD_LIMIT_WARNING, DISCLAIMER_TEXT } from '../../ui';
import { ScoreScreen } from './ScoreScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

function seedWith(change: (seed: Record<string, any>) => void) {
  const copy = JSON.parse(JSON.stringify(aaravSeed)) as Record<string, any>;
  change(copy);
  return parseSeed(copy);
}

async function renderScore(repository = createDemoRepository()) {
  await render(
    <DemoRepositoryProvider repository={repository}>
      <ScoreScreen />
    </DemoRepositoryProvider>,
  );
}

function allText(): string {
  return JSON.stringify(screen.toJSON());
}

beforeEach(() => jest.clearAllMocks());

describe('Score screen', () => {
  it('shows the estimated range, the zone word and the anchor, never one score', async () => {
    await renderScore();

    expect(screen.getByTestId('score-screen')).toBeTruthy();
    expect(screen.getByTestId('score-range').props.children).toBe('708–736');
    expect(screen.getByText('estimate')).toBeTruthy();
    expect(screen.getByText('Not your official CIBIL score.')).toBeTruthy();
    expect(screen.getByText(/Last reported 724 on Fri, 2 Oct/)).toBeTruthy();
    expect(screen.getByText('YOUR SCORE · CHECKED 19 DAYS AGO')).toBeTruthy();
    expect(allText()).toContain('good');
  });

  it('shows the with-plan range as a range', async () => {
    await renderScore();

    expect(screen.getByTestId('score-range-plan').props.children).toMatch(
      /^With plan · \d{3}–\d{3}$/,
    );
  });

  it('shows the top reasons with their direction in words', async () => {
    await renderScore();

    const rows = screen.getAllByTestId('reason-row');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(3);
    expect(screen.getByText('Highest card at 81.0%')).toBeTruthy();
    expect(screen.getAllByText(/lowers your score|improves your score/).length).toBe(rows.length);
  });

  it('offers the six what-if tiles', async () => {
    await renderScore();

    expect(screen.getAllByTestId(/^score-tile-/)).toHaveLength(6);
    expect(screen.getByText('Follow this month’s plan')).toBeTruthy();
    expect(screen.getByText('Close a card')).toBeTruthy();
  });

  it('ends with the self-check note and the disclaimer', async () => {
    await renderScore();

    expect(screen.getByText('Checking your own score never lowers it.')).toBeTruthy();
    expect(screen.getByText(DISCLAIMER_TEXT)).toBeTruthy();
  });

  it('does not show the guard banner below the configured inquiry count', async () => {
    await renderScore();

    expect(screen.queryByTestId('score-guard')).toBeNull();
  });

  it('shows the guard banner once hard inquiries reach N', async () => {
    const seed = seedWith((s) => {
      s.profile.history.hardInquiries6m = 2;
      s.profile.history.hardInquiries12m = 3;
    });
    await renderScore(createDemoRepository(seed));

    expect(screen.getByTestId('score-guard')).toBeTruthy();
    expect(
      screen.getByText('You already have 2 hard inquiries in the last 6 months.'),
    ).toBeTruthy();
  });

  it('goes back to Home', async () => {
    await renderScore();

    await fireEvent.press(screen.getByTestId('score-link-home'));

    expect(router.replace).toHaveBeenCalledWith('/home');
  });

  it('explains how the estimate works without a score', async () => {
    await renderScore();

    await fireEvent.press(screen.getByTestId('score-how-we-estimate'));

    expect(screen.getByTestId('score-how-text')).toBeTruthy();
  });

  it('says so instead of crashing when the estimate cannot be made', async () => {
    const seed = seedWith((s) => {
      s.profile.history.anchorDate = '2027-06-01';
    });
    await renderScore(createDemoRepository(seed));

    expect(screen.getByTestId('score-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('score-range')).toBeNull();
  });
});

describe('What-if flows', () => {
  it('close HDFC Millennia shows the engine range with the age and limit warnings', async () => {
    await renderScore();

    await fireEvent.press(screen.getByTestId('score-tile-close-card'));
    await fireEvent.press(screen.getByTestId('score-card-choice-hdfc-millennia'));
    await fireEvent.press(screen.getByTestId('score-whatif-go'));

    expect(screen.getByTestId('score-result')).toBeTruthy();
    expect(screen.getByText('If you close HDFC Millennia')).toBeTruthy();
    expect(screen.getByTestId('score-range').props.children).toBe('698–726');
    expect(screen.getByText(CLOSE_CARD_AGE_WARNING)).toBeTruthy();
    expect(screen.getByText(CLOSE_CARD_LIMIT_WARNING)).toBeTruthy();
    expect(screen.getByTestId('score-oldest-account')).toBeTruthy();
    expect(screen.getByTestId('score-limit-loss')).toBeTruthy();
    expect(screen.getByTestId('score-util-overall')).toBeTruthy();
  });

  it('follow this month’s plan shows an improved range straight away', async () => {
    await renderScore();

    await fireEvent.press(screen.getByTestId('score-tile-follow-plan'));

    expect(screen.getByTestId('score-result')).toBeTruthy();
    expect(
      within(screen.getByTestId('what-if-result')).getByText('improves your score'),
    ).toBeTruthy();
    expect(screen.queryByText(CLOSE_CARD_AGE_WARNING)).toBeNull();
  });

  it('miss a payment lowers the range with no inputs', async () => {
    await renderScore();

    await fireEvent.press(screen.getByTestId('score-tile-miss-payment'));

    expect(
      within(screen.getByTestId('what-if-result')).getByText('lowers your score'),
    ).toBeTruthy();
  });

  it('pay an amount on a card needs a valid amount before it runs', async () => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-pay-card'));

    expect(screen.getByTestId('score-whatif-go').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('score-amount'), '999999');
    expect(screen.getByText(/more than the ₹81,000 outstanding on HDFC Millennia/)).toBeTruthy();
    expect(screen.getByTestId('score-whatif-go').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('score-amount'), '50000');
    await fireEvent.press(screen.getByTestId('score-whatif-go'));

    expect(screen.getByText('If you pay ₹50,000 on HDFC Millennia')).toBeTruthy();
    expect(
      within(screen.getByTestId('what-if-result')).getByText('improves your score'),
    ).toBeTruthy();
  });

  it('apply for a card shows the guard impact as a range of points', async () => {
    await renderScore();

    await fireEvent.press(screen.getByTestId('score-tile-apply'));

    expect(screen.getByTestId('score-result-guard')).toBeTruthy();
    expect(screen.getByText(/Another application could cost about \d+–\d+ points\./)).toBeTruthy();
  });

  it('an FD-backed card needs an FD amount', async () => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-fd-card'));
    expect(screen.getByTestId('score-whatif-go').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('score-amount'), '50000');
    await fireEvent.press(screen.getByTestId('score-whatif-go'));

    expect(screen.getByText('If you open an FD-backed card with ₹50,000')).toBeTruthy();
    expect(screen.getByTestId('score-result-guard')).toBeTruthy();
  });

  it('never shows a bare three-digit score on a result', async () => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-miss-payment'));

    const texts = within(screen.getByTestId('score-result'));
    expect(texts.getByTestId('score-range').props.children).toMatch(/^\d{3}–\d{3}$/);
    expect(texts.getByTestId('score-before').props.children).toMatch(/^\d{3}–\d{3}$/);
  });

  it('Back to score returns to the main view', async () => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-miss-payment'));

    await fireEvent.press(screen.getByTestId('score-whatif-back'));

    expect(screen.queryByTestId('score-result')).toBeNull();
    expect(screen.getByTestId('score-tile-close-card')).toBeTruthy();
  });

  it('the Android back button leaves a what-if before it leaves the screen', async () => {
    const remove = jest.fn();
    let handler: (...args: never[]) => boolean | null | undefined = () => false;
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, cb) => {
      handler = cb;
      return { remove };
    });
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-miss-payment'));

    let handled = false;
    await act(async () => {
      handled = handler() === true;
    });

    expect(handled).toBe(true);
    expect(screen.queryByTestId('score-result')).toBeNull();
    spy.mockRestore();
  });
});

function textNodes(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((child) => textNodes(child, out));
  else if (node && typeof node === 'object') {
    textNodes((node as { children?: unknown }).children, out);
  }
  return out;
}

/** Visible text with ranges, rupee amounts and the one bureau-reported anchor taken out. */
function strayScores(): string[] {
  const text = textNodes(screen.toJSON())
    .join(' ')
    .replace(/Last reported 724/g, '')
    .replace(/\d{3}–\d{3}/g, '')
    .replace(/₹[\d,]+/g, '');
  return text.match(/(?<![\d.,])[3-9]\d{2}(?![\d,.%])/g) ?? [];
}

describe('No exact score anywhere (non-negotiable 3)', () => {
  const TAPS: [string, string[]][] = [
    ['the main view', []],
    ['follow the plan', ['score-tile-follow-plan']],
    ['miss a payment', ['score-tile-miss-payment']],
    ['apply', ['score-tile-apply']],
    ['close a card', ['score-tile-close-card', 'score-whatif-go']],
  ];

  it.each(TAPS)('%s shows only ranges', async (_name, taps) => {
    await renderScore();
    for (const id of taps) {
      await fireEvent.press(screen.getByTestId(id));
    }

    expect(strayScores()).toEqual([]);
  });

  it('pay an amount and an FD-backed card show only ranges', async () => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-pay-card'));
    await fireEvent.changeText(screen.getByTestId('score-amount'), '50000');
    await fireEvent.press(screen.getByTestId('score-whatif-go'));
    expect(strayScores()).toEqual([]);

    await fireEvent.press(screen.getByTestId('score-whatif-back'));
    await fireEvent.press(screen.getByTestId('score-tile-fd-card'));
    await fireEvent.changeText(screen.getByTestId('score-amount'), '50000');
    await fireEvent.press(screen.getByTestId('score-whatif-go'));
    expect(strayScores()).toEqual([]);
  });

  it('the check itself would catch a bare score', () => {
    expect('Estimated 724 today'.match(/(?<![\d.,])[3-9]\d{2}(?![\d,.%])/g)).toEqual(['724']);
  });
});

describe('Fix round 1', () => {
  it('omits a fully paid card from pay-card and says nothing is outstanding on it', async () => {
    const repository = createDemoRepository();
    repository.recordPayment('axis-neo', 15600, '2026-10-21');
    await renderScore(repository);

    await fireEvent.press(screen.getByTestId('score-tile-pay-card'));

    expect(screen.queryByTestId('score-card-choice-axis-neo')).toBeNull();
    expect(screen.getByTestId('score-card-choice-hdfc-millennia')).toBeTruthy();
  });

  it('with nothing outstanding anywhere, pay-card says so and cannot run', async () => {
    const repository = createDemoRepository();
    for (const card of repository.listCards()) {
      repository.recordPayment(card.id, card.outstanding, '2026-10-21');
    }
    await renderScore(repository);

    await fireEvent.press(screen.getByTestId('score-tile-pay-card'));

    expect(screen.getByTestId('score-nothing-to-pick')).toBeTruthy();
    expect(screen.getByTestId('score-whatif-go').props.accessibilityState.disabled).toBe(true);
  });

  it.each(['99999999999', '10000001'])('keeps the button off for %s', async (typed) => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-fd-card'));

    await fireEvent.changeText(screen.getByTestId('score-amount'), typed);

    expect(screen.getByTestId('score-whatif-go').props.accessibilityState.disabled).toBe(true);
  });

  it('cuts decimals to whole rupees so the amount stays valid', async () => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-fd-card'));

    await fireEvent.changeText(screen.getByTestId('score-amount'), '1200.50');

    expect(screen.getByTestId('score-whatif-go').props.accessibilityState.disabled).toBe(false);
  });

  it('what-if after a recorded payment uses the lower balance and the same cash as Home', async () => {
    const repository = createDemoRepository();
    repository.recordPayment('hdfc-millennia', 40000, '2026-10-21');
    await renderScore(repository);

    expect(screen.getByTestId('score-range-plan').props.children).toMatch(
      /^With plan · \d{3}–\d{3}$/,
    );
    await fireEvent.press(screen.getByTestId('score-tile-close-card'));
    await fireEvent.press(screen.getByTestId('score-whatif-go'));
    expect(screen.getByTestId('score-util-overall').props.children).toContain(
      'Overall utilization 31.7% → ',
    );
  });

  it('shows no guard banner for 2 inquiries when N is 4, and the banner when N is 2', async () => {
    const seed = seedWith((s) => {
      s.profile.history.hardInquiries6m = 2;
      s.profile.history.hardInquiries12m = 2;
    });
    const quiet = createDemoRepository(seed);
    const getQuiet = quiet.getRules.bind(quiet);
    await renderScore({ ...quiet, getRules: () => ({ ...getQuiet(), minHardInquiries6m: 4 }) });
    expect(screen.queryByTestId('score-guard')).toBeNull();
  });

  it('shows the banner for 2 inquiries when N is 2', async () => {
    const seed = seedWith((s) => {
      s.profile.history.hardInquiries6m = 2;
      s.profile.history.hardInquiries12m = 2;
    });
    const loud = createDemoRepository(seed);
    const getLoud = loud.getRules.bind(loud);
    await renderScore({ ...loud, getRules: () => ({ ...getLoud(), minHardInquiries6m: 2 }) });
    expect(screen.getByTestId('score-guard')).toBeTruthy();
  });

  it('announces the result when a what-if opens', async () => {
    const send = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation();
    await renderScore();

    await fireEvent.press(screen.getByTestId('score-tile-miss-payment'));

    expect(send).toHaveBeenCalledWith(expect.stringContaining('If you miss a payment'));
    send.mockRestore();
  });

  it('shows the estimate tag beside the NOW range', async () => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-miss-payment'));

    expect(within(screen.getByTestId('score-result')).getAllByText('estimate').length).toBe(2);
  });

  it('renders a card with no limit without crashing', async () => {
    const seed = seedWith((s) => {
      s.cards[2].limit = 0;
    });
    await renderScore(createDemoRepository(seed));

    expect(screen.getByTestId('score-range')).toBeTruthy();
  });

  it('closing the only card still shows the warnings', async () => {
    const seed = seedWith((s) => {
      s.cards = [s.cards[0]];
    });
    await renderScore(createDemoRepository(seed));
    await fireEvent.press(screen.getByTestId('score-tile-close-card'));
    await fireEvent.press(screen.getByTestId('score-whatif-go'));

    expect(screen.getByText(CLOSE_CARD_AGE_WARNING)).toBeTruthy();
  });

  it('opens each what-if form fresh after going back', async () => {
    await renderScore();
    await fireEvent.press(screen.getByTestId('score-tile-fd-card'));
    await fireEvent.changeText(screen.getByTestId('score-amount'), '5000');
    await fireEvent.press(screen.getByTestId('score-whatif-back'));

    await fireEvent.press(screen.getByTestId('score-tile-fd-card'));

    expect(screen.getByTestId('score-amount').props.value).toBe('');
  });

  it('works as the /score route on its own', async () => {
    await render(
      <DemoRepositoryProvider repository={createDemoRepository()}>
        <ScoreRoute />
      </DemoRepositoryProvider>,
    );

    expect(screen.getByTestId('score-screen')).toBeTruthy();
  });
});
