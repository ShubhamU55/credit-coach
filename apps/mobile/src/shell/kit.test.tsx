import { render, screen } from '@testing-library/react-native';

import KitRoute from '../app/kit';

describe('Kit route', () => {
  it('renders the kit gallery', async () => {
    await render(<KitRoute />);

    expect(
      screen.getByTestId('kit-buttons-title', { includeHiddenElements: true }),
    ).toBeOnTheScreen();
  });
});
