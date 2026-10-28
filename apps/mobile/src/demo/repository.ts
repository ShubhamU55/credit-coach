import aaravSeed from './aarav.json';
import { parseSeed } from './seed';
import {
  RepositoryError,
  type DemoCard,
  type DemoPayment,
  type DemoProfile,
  type DemoRepository,
  type DemoRules,
  type DemoSeed,
  type IsoDate,
} from './types';

// Validated once at module load: a typo in aarav.json fails here, not deep inside a screen.
const SEED: DemoSeed = parseSeed(aaravSeed);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function clone<T>(value: T): T {
  // The data is plain JSON. structuredClone is not guaranteed on Hermes, so avoid it.
  return JSON.parse(JSON.stringify(value)) as T;
}

function isIsoCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // Date.UTC with explicit arguments is deterministic; it never reads the clock.
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * In-memory demo repository seeded from `aarav.json`. State lives only in this
 * instance; the seed is deep-cloned on construction and on `reset()` so the shared
 * imported JSON can never be mutated. Reads return copies.
 */
export function createDemoRepository(seed: DemoSeed = SEED): DemoRepository {
  let profile: DemoProfile = clone(seed.profile);
  let rules: DemoRules = clone(seed.rules);
  let cards: DemoCard[] = clone(seed.cards);
  let payments: DemoPayment[] = [];
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((listener) => listener());
  }

  return {
    getProfile: () => clone(profile),
    listCards: () => clone(cards),
    getRules: () => clone(rules),
    listPayments: () => clone(payments),

    recordPayment(cardId: string, amount: number, date: IsoDate): DemoPayment {
      const card = cards.find((c) => c.id === cardId);
      if (!card) {
        throw new RepositoryError('unknown_card', `Unknown card: ${cardId}`);
      }
      if (!Number.isInteger(amount) || amount <= 0) {
        throw new RepositoryError(
          'invalid_amount',
          'Payment must be a whole number of rupees above 0',
        );
      }
      if (amount > card.outstanding) {
        throw new RepositoryError(
          'amount_exceeds_outstanding',
          `Payment of ${amount} is more than the ${card.outstanding} outstanding on ${card.name}`,
        );
      }
      if (!isIsoCalendarDate(date)) {
        throw new RepositoryError('invalid_date', `Not an ISO date (YYYY-MM-DD): ${date}`);
      }

      card.outstanding -= amount;
      card.paidSinceStatement += amount;
      const payment: DemoPayment = {
        id: `payment-${payments.length + 1}`,
        cardId,
        amount,
        date,
      };
      payments = [...payments, payment];
      notify();
      return clone(payment);
    },

    reset() {
      profile = clone(seed.profile);
      rules = clone(seed.rules);
      cards = clone(seed.cards);
      payments = [];
      notify();
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
