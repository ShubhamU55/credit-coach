import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { createDemoRepository } from '../demo/repository';
import type { DemoRepository } from '../demo/types';

interface DemoRepositoryValue {
  repository: DemoRepository;
  /** Bumped on every repository change so the context value (and consumers) refresh. */
  version: number;
}

const DemoRepositoryContext = createContext<DemoRepositoryValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Inject a repository (tests, or a Supabase-backed one later). Defaults to Aarav in memory. */
  repository?: DemoRepository;
}

export function DemoRepositoryProvider({ children, repository }: ProviderProps) {
  const [defaultRepository] = useState(() => createDemoRepository());
  const activeRepository = repository ?? defaultRepository;
  const [version, setVersion] = useState(0);

  useEffect(
    () => activeRepository.subscribe(() => setVersion((current) => current + 1)),
    [activeRepository],
  );

  const value = useMemo(
    () => ({ repository: activeRepository, version }),
    [activeRepository, version],
  );

  return <DemoRepositoryContext.Provider value={value}>{children}</DemoRepositoryContext.Provider>;
}

/**
 * The demo repository for the current session. Components that call it re-render after
 * any recordPayment/reset, so reading `listCards()` during render is always current.
 */
export function useDemoRepository(): DemoRepository {
  const value = useContext(DemoRepositoryContext);
  if (!value) {
    throw new Error('useDemoRepository must be used inside <DemoRepositoryProvider>');
  }
  return value.repository;
}
