import { useState } from 'react';
import { formatINR } from '@credit-coach/engine';

import type { DemoCard } from '../../demo/types';
import { AmountInput, ChoiceRows, PopButton, Text, TextAction, type ChoiceOption } from '../../ui';
import type { ScenarioInput, TileKey } from './viewModel';

export interface WhatIfConfigureProps {
  tile: Extract<TileKey, 'pay-card' | 'close-card' | 'fd-card'>;
  cards: readonly DemoCard[];
  onRun: (input: ScenarioInput) => void;
  onBack: () => void;
}

const COPY = {
  'pay-card': { overline: 'PAY AN AMOUNT', title: 'Which card, and how much?' },
  'close-card': { overline: 'CLOSE A CARD', title: 'Which card would you close?' },
  'fd-card': { overline: 'OPEN AN FD-BACKED CARD', title: 'How much would you put in the FD?' },
} as const;

function cardOptions(cards: readonly DemoCard[]): ChoiceOption<string>[] {
  return cards.map((card) => ({
    key: card.id,
    label: card.name,
    sub: `${formatINR(card.outstanding)} of ${formatINR(card.limit)} used`,
    amount: '',
  }));
}

/** Digits to a whole-rupee amount, or undefined while the field is empty. */
function toAmount(digits: string): number | undefined {
  return digits === '' ? undefined : Number(digits);
}

/** Validation message that says what is wrong and what to do (design.md section 9). */
function amountProblem(
  tile: WhatIfConfigureProps['tile'],
  amount: number | undefined,
  card: DemoCard | undefined,
): string | undefined {
  if (amount === undefined) return undefined;
  if (amount <= 0) return 'Enter an amount above ₹0.';
  if (tile === 'pay-card' && card && amount > card.outstanding) {
    return `That’s more than the ${formatINR(card.outstanding)} outstanding on ${card.name}. Enter ${formatINR(card.outstanding)} or less.`;
  }
  return undefined;
}

function inputsReady(args: {
  needsCard: boolean;
  needsAmount: boolean;
  card: DemoCard | undefined;
  amount: number | undefined;
  problem: string | undefined;
}): boolean {
  const cardOk = !args.needsCard || args.card !== undefined;
  const amountOk = !args.needsAmount || (args.amount !== undefined && args.problem === undefined);
  return cardOk && amountOk;
}

/** The inputs a what-if needs before it can run: a card, an amount, or both. */
export function WhatIfConfigure({ tile, cards, onRun, onBack }: WhatIfConfigureProps) {
  const [cardId, setCardId] = useState<string>(cards[0]?.id ?? '');
  const [digits, setDigits] = useState('');
  const needsCard = tile !== 'fd-card';
  const needsAmount = tile !== 'close-card';
  const amount = toAmount(digits);
  const card = cards.find((c) => c.id === cardId);
  const problem = needsAmount ? amountProblem(tile, amount, card) : undefined;
  const ready = inputsReady({ needsCard, needsAmount, card, amount, problem });
  return (
    <>
      <TextAction label="Back to score" onPress={onBack} testID="score-whatif-back" />
      <Text variant="overline">{COPY[tile].overline}</Text>
      <Text variant="h1">{COPY[tile].title}</Text>
      {needsCard ? (
        <ChoiceRows
          options={cardOptions(cards)}
          value={cardId}
          onChange={setCardId}
          testID="score-card-choice"
        />
      ) : null}
      {needsAmount ? (
        <AmountInput
          label={tile === 'fd-card' ? 'FD amount' : 'Amount to pay'}
          value={digits}
          onChangeText={setDigits}
          status={problem ? 'error' : 'default'}
          message={problem}
          testID="score-amount"
        />
      ) : null}
      <PopButton
        label="See the result"
        disabled={!ready}
        onPress={() => onRun({ cardId: needsCard ? cardId : undefined, amount })}
        testID="score-whatif-go"
      />
    </>
  );
}
