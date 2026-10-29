import {
  createContext,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

import { createDemoRepository } from '../demo/repository';
import type { DemoRepository } from '../demo/types';

const DemoRepositoryContext = createContext<DemoRepository | null>(null);

interface ProviderProps {
  children: ReactNode;
  /** Inject a repository (tests, or a Supabase-backed one later). Defaults to Aarav in memory. */
  repository?: DemoRepository;
}

export function DemoRepositoryProvider({ children, repository }: ProviderProps) {
  const [defaultRepository] = useState(() => createDemoRepository());
  return (
    <DemoRepositoryContext.Provider value={repository ?? defaultRepository}>
      {children}
    </DemoRepositoryContext.Provider>
  );
}

/**
 * The repository itself, for writing (recordPayment, reset). It never changes identity, so
 * reading from it during render does NOT re-render when data changes: use the snapshot
 * hooks below (useCards, usePayments, useProfile, useRules) for anything shown on screen.
 */
export function useDemoRepository(): DemoRepository {
  const repository = useContext(DemoRepositoryContext);
  if (!repository) {
    throw new Error('useDemoRepository must be used inside <DemoRepositoryProvider>');
  }
  return repository;
}

/**
 * Snapshot hooks. Each returns a value that is referentially stable until the repository
 * changes, so it is safe in dependency arrays and under React.memo. useSyncExternalStore
 * re-checks the version when it subscribes, so a write made by a descendant's mount effect
 * (which runs before this component's subscription) still updates the UI.
 */
function useSnapshot<T>(read: (repository: DemoRepository) => T): T {
  const repository = useDemoRepository();
  const version = useSyncExternalStore(
    repository.subscribe,
    repository.getVersion,
    repository.getVersion,
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` is the cache key
  return useMemo(() => read(repository), [repository, version]);
}

export const useCards = () => useSnapshot((repository) => repository.listCards());
export const usePayments = () => useSnapshot((repository) => repository.listPayments());
export const useProfile = () => useSnapshot((repository) => repository.getProfile());
export const useRules = () => useSnapshot((repository) => repository.getRules());
