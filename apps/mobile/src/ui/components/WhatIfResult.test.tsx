import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { color } from '../theme';
import { CLOSE_CARD_AGE_WARNING, CLOSE_CARD_LIMIT_WARNING, WhatIfResult } from './WhatIfResult';

const hidden = { includeHiddenElements: true } as const;

describe('WhatIfResult', () => {
  test('shows the result range on one line, labelled as an estimate', async () => {
    await render(<WhatIfResult variant="standard" range="690–718" direction="lowers" />);

    expect(screen.getByTestId('score-range')).toHaveTextContent('690–718', { exact: true });
    expect(screen.getByTestId('score-range')).toHaveProp('numberOfLines', 1);
    expect(screen.getByText('estimate')).toBeOnTheScreen();
    expect(screen.getByText('Not your official CIBIL score.')).toBeOnTheScreen();
  });

  test.each([
    ['lowers', 'lowers your score', '↓', color.error],
    ['improves', 'improves your score', '↑', color.success],
    ['barely moves', 'barely moves your score', '→', color.muted],
  ] as const)(
    '%s: the direction is in words and an arrow',
    async (direction, words, arrow, tone) => {
      await render(<WhatIfResult variant="standard" range="690–718" direction={direction} />);

      expect(screen.getByText(words)).toBeOnTheScreen();
      expect(StyleSheet.flatten(screen.getByText(arrow, hidden).props.style).color).toBe(tone);
    },
  );

  test('the warning slot is always mounted, and empty for a standard result', async () => {
    await render(<WhatIfResult variant="standard" range="690–718" direction="lowers" />);

    expect(screen.getByTestId('what-if-warning', hidden)).toHaveProp(
      'accessibilityLiveRegion',
      'polite',
    );
    expect(screen.queryByText(CLOSE_CARD_AGE_WARNING)).toBeNull();
    expect(screen.queryByText(CLOSE_CARD_LIMIT_WARNING)).toBeNull();
  });

  test('closing a card carries both the credit-age and the limit-loss warning', async () => {
    await render(<WhatIfResult variant="closeCard" range="670–700" direction="lowers" />);

    expect(screen.getByText(CLOSE_CARD_AGE_WARNING)).toBeOnTheScreen();
    expect(screen.getByText(CLOSE_CARD_LIMIT_WARNING)).toBeOnTheScreen();
    expect(CLOSE_CARD_AGE_WARNING).toMatch(/credit age/i);
    expect(CLOSE_CARD_LIMIT_WARNING).toMatch(/limit/i);
  });

  test('the close-card variant cannot render without both warnings, whatever else is passed', async () => {
    await render(
      // @ts-expect-error a caller trying to blank the warning: the type forbids it, and so does the component
      <WhatIfResult variant="closeCard" range="670–700" direction="lowers" warning="" />,
    );

    expect(screen.getByText(CLOSE_CARD_AGE_WARNING)).toBeOnTheScreen();
    expect(screen.getByText(CLOSE_CARD_LIMIT_WARNING)).toBeOnTheScreen();
  });
});
