import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';

import { DEMO_TODAY } from '../../demo/config';
import { createDemoRepository } from '../../demo/repository';
import { DemoRepositoryProvider } from '../../state/DemoRepositoryContext';
import { DISCLAIMER_TEXT } from '../../ui';
import { HomeScreen } from './HomeScreen';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockRouter = router as jest.Mocked<typeof router>;

async function renderHome(repository = createDemoRepository()) {
  await render(
    <DemoRepositoryProvider repository={repository}>
      <HomeScreen />
    </DemoRepositoryProvider>,
  );
  return repository;
}

beforeEach(() => jest.clearAllMocks());

describe('HomeScreen with the Aarav sample profile', () => {
  it('greets Aarav and shows the sample strip with Switch', async () => {
    await renderHome();

    expect(screen.getByTestId('home-screen')).toBeTruthy();
    expect(
      screen.getByRole('header', { name: /Aarav, one payment keeps you on track\./ }),
    ).toBeTruthy();
    expect(screen.getByText('SAMPLE PROFILE ·')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AM, account settings' })).toBeTruthy();
  });

  it('shows overall utilization 45.0% with the totals and the after-plan delta', async () => {
    await renderHome();

    const tile = within(screen.getByTestId('home-stat-utilization'));
    expect(tile.getByText('45.0%')).toBeTruthy();
    expect(tile.getByText('₹1,35,000 of ₹3,00,000 · target 30%')).toBeTruthy();
    expect(tile.getByText('↓ 15.3% after plan')).toBeTruthy();
  });

  it('shows the estimated score as a range with the zone and the with-plan range', async () => {
    await renderHome();

    const tile = within(screen.getByTestId('home-stat-score'));
    expect(tile.getByText('708–736')).toBeTruthy();
    expect(tile.getByText('estimate · Good')).toBeTruthy();
    expect(tile.getByText('↑ 724–752 with plan')).toBeTruthy();
  });

  it('shows the hero payment for Axis Neo with the statement amount and the minimum', async () => {
    await renderHome();

    const hero = within(screen.getByTestId('hero-card'));
    expect(hero.getByText('Axis Neo')).toBeTruthy();
    expect(hero.getByText('₹12,400')).toBeTruthy();
    expect(hero.getByText('BY THU, 22 OCT')).toBeTruthy();
    expect(hero.getByText('₹620 of it is your minimum.')).toBeTruthy();
    expect(hero.getByText(/clears your full statement/)).toBeTruthy();
    expect(hero.getByText(/THIS MONTH'S PLAN · 0 of 5 done/)).toBeTruthy();
  });

  it('lists the three cards with colour-coded utilization and words', async () => {
    await renderHome();

    expect(screen.getByText('YOUR CARDS · 3')).toBeTruthy();
    ['HDFC Millennia', 'SBI SimplyClick', 'Axis Neo'].forEach((name) => {
      expect(
        within(screen.getByTestId(`home-card-${name.toLowerCase().replace(' ', '-')}`)).getByText(
          name,
        ),
      ).toBeTruthy();
    });
    expect(within(screen.getByTestId('home-card-hdfc-millennia')).getByText('81.0%')).toBeTruthy();
    expect(
      within(screen.getByTestId('home-card-hdfc-millennia')).getByText('⚠ OVER 30%'),
    ).toBeTruthy();
    expect(within(screen.getByTestId('home-card-axis-neo')).getByText('19.5%')).toBeTruthy();
    expect(within(screen.getByTestId('home-card-axis-neo')).getByText('✓ ON TARGET')).toBeTruthy();
    expect(
      within(screen.getByTestId('home-card-sbi-simplyclick')).getByText(
        '₹38,400 / ₹1,20,000 · nothing due · statement 25 Oct',
      ),
    ).toBeTruthy();
  });

  it('shows the next two steps under Coming up', async () => {
    await renderHome();

    expect(screen.getByText('COMING UP')).toBeTruthy();
    expect(screen.getByText('₹3,710')).toBeTruthy();
    expect(screen.getByText('₹70,490')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'All 5 steps' })).toBeTruthy();
  });

  it('ends with the verbatim disclaimer', async () => {
    await renderHome();

    expect(screen.getByText(DISCLAIMER_TEXT)).toBeTruthy();
  });

  it('never shows a full PAN or the mobile number', async () => {
    await renderHome();

    expect(screen.queryByText(/ABCDE|[A-Z]{5}\d{4}[A-Z]/)).toBeNull();
    expect(screen.queryByText(/\+91/)).toBeNull();
  });
});

describe('HomeScreen navigation', () => {
  it('opens Mark as paid from the hero and Plan from View full plan', async () => {
    await renderHome();

    await fireEvent.press(screen.getByTestId('hero-mark-paid'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/mark-paid');

    await fireEvent.press(screen.getByTestId('hero-view-plan'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/plan');
  });

  it('opens Plan from the utilization tile and Score from the score tile', async () => {
    await renderHome();

    await fireEvent.press(screen.getByTestId('home-stat-utilization'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/plan');

    await fireEvent.press(screen.getByTestId('home-stat-score'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/score');
  });

  it('opens Plan from a Coming up row and from All steps', async () => {
    await renderHome();

    await fireEvent.press(screen.getByTestId('date-block-row-0'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/plan');

    mockRouter.push.mockClear();
    await fireEvent.press(screen.getByRole('link', { name: 'All 5 steps' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/plan');
  });

  it('navigates with the floating nav tabs and stays put on Home', async () => {
    await renderHome();

    await fireEvent.press(screen.getByTestId('nav-tab-score'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/score');
    await fireEvent.press(screen.getByTestId('nav-tab-plan'));
    expect(mockRouter.push).toHaveBeenLastCalledWith('/plan');

    mockRouter.push.mockClear();
    await fireEvent.press(screen.getByTestId('nav-tab-home'));
    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(screen.getByTestId('nav-tab-home').props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('goes back to Welcome from the sample strip Switch', async () => {
    await renderHome();

    await fireEvent.press(screen.getByTestId('sample-strip-switch'));

    expect(mockRouter.replace).toHaveBeenCalledWith('/');
  });
});

describe('HomeScreen state changes', () => {
  it('updates when a payment is recorded', async () => {
    const repository = await renderHome();

    await act(async () => repository.recordPayment('axis-neo', 12400, DEMO_TODAY));

    expect(await screen.findByText(/1 of \d done/)).toBeTruthy();
    expect(within(screen.getByTestId('home-card-axis-neo')).getByText('4.0%')).toBeTruthy();
  });

  it('flags a card with no limit and leaves it out of the utilization', async () => {
    const repository = createDemoRepository();
    const [first] = repository.listCards();
    const seed = {
      profile: repository.getProfile(),
      rules: repository.getRules(),
      cards: repository.listCards().map((c) => (c.id === first.id ? { ...c, limit: 0 } : c)),
    };
    await renderHome(createDemoRepository(seed));

    expect(screen.getByTestId('home-excluded-note')).toHaveTextContent(
      'HDFC Millennia has no credit limit on file, so it is left out of your utilization.',
    );
    expect(screen.getByText('YOUR CARDS · 2')).toBeTruthy();
    expect(within(screen.getByTestId('home-stat-utilization')).getByText('27.0%')).toBeTruthy();
  });

  it('shows the planner note instead of the hero when nothing is left to pay', async () => {
    const repository = createDemoRepository();
    repository.listCards().forEach((card) => {
      if (card.outstanding > 0) repository.recordPayment(card.id, card.outstanding, DEMO_TODAY);
    });
    await renderHome(repository);

    expect(screen.queryByTestId('hero-card')).toBeNull();
    expect(screen.getByTestId('home-nothing-to-do')).toBeTruthy();
  });
});
