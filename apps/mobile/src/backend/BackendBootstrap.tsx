import { useEffect } from 'react';

import { useDemoRepository } from '../state/DemoRepositoryContext';
import { startBackend } from './start';

/**
 * Renders nothing. After the first render it starts the background backend sync (anonymous
 * sign-in, then the admin's coaching rules). The UI never waits for it and never sees its errors.
 */
export function BackendBootstrap() {
  const repository = useDemoRepository();
  useEffect(() => {
    startBackend({ repository }).catch(() => undefined);
  }, [repository]);
  return null;
}
