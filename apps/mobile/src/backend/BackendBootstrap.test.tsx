import { render, screen } from '@testing-library/react-native';

import { createDemoRepository } from '../demo/repository';
import { DemoRepositoryProvider } from '../state/DemoRepositoryContext';
import { BackendBootstrap } from './BackendBootstrap';
import { startBackend } from './start';

jest.mock('./start', () => ({ startBackend: jest.fn(async () => undefined) }));

describe('BackendBootstrap', () => {
  beforeEach(() => jest.mocked(startBackend).mockClear());

  it('renders nothing and starts the background sync once with the app repository', async () => {
    const repository = createDemoRepository();

    await render(
      <DemoRepositoryProvider repository={repository}>
        <BackendBootstrap />
      </DemoRepositoryProvider>,
    );

    expect(screen.toJSON()).toBeNull();
    expect(startBackend).toHaveBeenCalledTimes(1);
    expect(startBackend).toHaveBeenCalledWith({ repository });
  });

  it('does not let a failing start reach the UI', async () => {
    jest.mocked(startBackend).mockRejectedValueOnce(new Error('boom'));

    await expect(
      render(
        <DemoRepositoryProvider>
          <BackendBootstrap />
        </DemoRepositoryProvider>,
      ),
    ).resolves.toBeDefined();
  });
});
