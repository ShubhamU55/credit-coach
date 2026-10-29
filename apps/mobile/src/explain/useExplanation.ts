import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildExplainPayload,
  buildTemplateExplanation,
  type ExplainCard,
  type ExplainContext,
  type Plan,
} from '@credit-coach/engine';

import {
  configFromExpoEnv,
  fetchExplanation,
  type ExplainConfig,
  type ExplanationSource,
} from './client';

export interface UseExplanationOptions {
  /** Defaults to the EXPO_PUBLIC_* values; pass null to force template-only. */
  config?: ExplainConfig | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface ExplanationView {
  text: string;
  /** Pass to <AIExplanation aiWritten=...>: true only when the text really is AI-written. */
  aiWritten: boolean;
  /** True while the AI call is in flight; the template is already on screen. */
  loading: boolean;
}

interface Resolved {
  key: string;
  text: string;
  source: ExplanationSource;
}

/**
 * The "Why this plan?" text for the Plan screen. It returns the engine's template on the
 * first render and upgrades to AI wording only if the `explain` function answers in time with
 * a valid body. The app is fully usable with the function absent: any failure leaves the
 * template in place, silently.
 */
export function useExplanation(
  plan: Plan,
  cards: readonly ExplainCard[],
  context: ExplainContext,
  options: UseExplanationOptions = {},
): ExplanationView {
  const { today, rules } = context;
  const { thresholdPct, aimFor10 } = rules;
  const { fetchImpl, timeoutMs } = options;
  // Read the env once per mount: a fresh object each render would re-trigger the effect.
  const [envConfig] = useState(() => configFromExpoEnv());
  const config = options.config === undefined ? envConfig : options.config;

  const { template, payload, key } = useMemo(() => {
    const built = buildExplainPayload(plan, cards, { today, rules: { thresholdPct, aimFor10 } });
    return {
      template: buildTemplateExplanation(plan, cards),
      payload: built,
      key: JSON.stringify(built),
    };
  }, [plan, cards, today, thresholdPct, aimFor10]);

  const [resolved, setResolved] = useState<Resolved | null>(null);

  // The effect is keyed on `key` alone: callers may pass fresh-but-equal objects every render,
  // and that must not refetch. The latest values live in a ref the effect reads when it fires.
  const latest = useRef({ payload, template, config, fetchImpl, timeoutMs });
  useEffect(() => {
    latest.current = { payload, template, config, fetchImpl, timeoutMs };
  });
  const configured = config !== null;

  useEffect(() => {
    const call = latest.current;
    if (!configured || !call.config) return undefined;
    const controller = new AbortController();
    let cancelled = false;
    void fetchExplanation({ ...call, signal: controller.signal }).then((result) => {
      if (!cancelled) setResolved({ key, ...result });
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [key, configured]);

  // A stale answer for a previous plan is ignored: the key must match the current payload.
  const current = resolved?.key === key ? resolved : null;
  return {
    text: current?.text ?? template,
    aiWritten: current?.source === 'ai',
    loading: config !== null && current === null,
  };
}
