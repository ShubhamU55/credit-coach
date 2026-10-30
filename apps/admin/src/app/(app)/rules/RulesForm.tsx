'use client';

import { useActionState, useState, type FormEvent } from 'react';
import { saveRules, type SaveState } from './actions';
import {
  INT_RANGES,
  PLANNER_STEPS,
  REPORTING_BASES,
  WEIGHT_KEYS,
  rawFromFormData,
  validateRules,
  type IntField,
  type RawRules,
} from '@/lib/validation';
import styles from '../../admin.module.css';

const INT_LABELS: Record<IntField, string> = {
  threshold_pct: 'Utilization threshold (%)',
  excellent_pct: '"Excellent" line (%)',
  pay_by_buffer_days: 'Pay-by buffer (days)',
  guard_min_hard_inquiries: 'Guard: hard inquiries to warn at',
  reminder_prepay_days: 'Reminder: pre-payment (days before)',
};

export function RulesForm({ initial }: { initial: RawRules }) {
  const [state, action, pending] = useActionState<SaveState, FormData>(saveRules, {
    status: 'idle',
  });
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const errors = { ...state.errors, ...clientErrors };

  // The same validate function the server runs: a bad value never leaves the browser.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const result = validateRules(rawFromFormData(new FormData(event.currentTarget)));
    if (result.ok) {
      setClientErrors({});
    } else {
      event.preventDefault();
      setClientErrors(result.errors);
    }
  }

  const field = (name: string) => ({
    name,
    defaultValue: initial[name] ?? '',
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `${name}-error` : undefined,
  });
  const fieldError = (name: string) =>
    errors[name] ? (
      <span id={`${name}-error`} role="alert" className={styles.error}>
        {errors[name]}
      </span>
    ) : null;

  return (
    <form action={action} onSubmit={onSubmit} noValidate>
      <div className={styles.grid}>
        {(Object.keys(INT_RANGES) as IntField[]).map((name) => (
          <label key={name} className={styles.field}>
            {INT_LABELS[name]}
            <input type="text" inputMode="numeric" {...field(name)} />
            <span className={styles.hint}>
              {INT_RANGES[name][0]} to {INT_RANGES[name][1]}
            </span>
            {fieldError(name)}
          </label>
        ))}
        <label className={styles.field}>
          Reporting basis
          <select {...field('reporting_basis')}>
            {REPORTING_BASES.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
          {fieldError('reporting_basis')}
        </label>
        <label className={styles.field}>
          Reminder: due-date days (comma separated)
          <input type="text" {...field('reminder_due_days')} />
          <span className={styles.hint}>1 to 5 values, each 0 to 14</span>
          {fieldError('reminder_due_days')}
        </label>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Planner step order</legend>
        <div className={styles.grid}>
          {[1, 2, 3, 4].map((n) => (
            <label key={n} className={styles.field}>
              Step {n}
              <select {...field(`step_${n}`)}>
                <option value="">(choose)</option>
                {PLANNER_STEPS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
        {fieldError('planner_step_order')}
      </fieldset>

      <fieldset className={styles.fieldset}>
        <legend>Predictor factor weights (0 to 100 each)</legend>
        <div className={styles.grid}>
          {WEIGHT_KEYS.map((key) => (
            <label key={key} className={styles.field}>
              {key}
              <input type="text" inputMode="decimal" {...field(`w_${key}`)} />
              {fieldError(`w_${key}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <p>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving...' : 'Save rules'}
        </button>
      </p>
      {state.status === 'saved' && Object.keys(clientErrors).length === 0 ? (
        <p role="status" className={styles.ok} data-testid="save-ok">
          {state.message}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <p role="alert" className={styles.error} data-testid="save-error">
          {state.message}
        </p>
      ) : null}
      {Object.keys(clientErrors).length > 0 ? (
        <p role="alert" className={styles.error} data-testid="save-error">
          Fix the highlighted fields.
        </p>
      ) : null}
    </form>
  );
}
