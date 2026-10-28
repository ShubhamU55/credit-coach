// Plain demo-data types. Deliberately independent of @credit-coach/engine (PD-1 is
// publishing the engine's own Card/CoachRules types); screen streams adapt these.
// Money is integer rupees. Dates are ISO strings (YYYY-MM-DD).

export type IsoDate = string;

export type ReportingBasis = 'statement' | 'weekly_current';

export interface DemoCard {
  id: string;
  name: string;
  issuer: string;
  initials: string;
  limit: number;
  outstanding: number;
  lastStatementBalance: number;
  lastStatementDate: IsoDate | null;
  statementDay: number;
  nextStatementDate: IsoDate;
  dueDay: number | null;
  dueDate: IsoDate | null;
  minimumDue: number;
  paidSinceStatement: number;
}

export interface DemoRules {
  thresholdPct: number;
  excellentPct: number;
  reportingBasis: ReportingBasis;
  aimFor10: boolean;
}

export interface DemoCreditHistory {
  anchorScore: number;
  anchorDate: IsoDate;
  monthsWithZeroMissed: number;
  missedPayments: number;
  hardInquiries6m: number;
  oldestAccountCardId: string;
  oldestAccountMonths: number;
  securedAccounts: number;
  unsecuredAccounts: number;
}

export interface DemoProfile {
  id: string;
  name: string;
  firstName: string;
  isSample: boolean;
  persona: string;
  panMasked: string;
  mobileMasked: string;
  cashForCards: number;
  history: DemoCreditHistory;
}

export interface DemoSeed {
  profile: DemoProfile;
  rules: DemoRules;
  cards: DemoCard[];
}

export interface DemoPayment {
  id: string;
  cardId: string;
  amount: number;
  date: IsoDate;
}

export type RepositoryErrorCode =
  | 'unknown_card'
  | 'invalid_amount'
  | 'amount_exceeds_outstanding'
  | 'invalid_date';

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode;

  constructor(code: RepositoryErrorCode, message: string) {
    super(message);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export interface DemoRepository {
  getProfile(): DemoProfile;
  listCards(): DemoCard[];
  getRules(): DemoRules;
  /** Lowers the card's outstanding by `amount` and raises its paidSinceStatement. */
  recordPayment(cardId: string, amount: number, date: IsoDate): DemoPayment;
  listPayments(): DemoPayment[];
  /** Restores the seed data and clears recorded payments. */
  reset(): void;
  /** Called after recordPayment/reset change state. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
}
