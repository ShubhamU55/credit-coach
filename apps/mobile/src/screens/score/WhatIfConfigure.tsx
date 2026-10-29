import { useState } from 'react';
import { formatINR } from '@credit-coach/engine';

import type { DemoCard } from '../../demo/types';
import { AmountInput, ChoiceRows, PopButton, Text, TextAction, type ChoiceOption } from '../../ui';
import { amountProblem, type ScenarioInput, type TileKey } from './viewModel';

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

/** Cards a what-if can pick: paying a card with nothing outstanding is not an option. */
function pickableCards(tile: WhatIfConfigureProps['tile'], cards: readonly DemoCard[]) {
  return tile === 'pay-card' ? cards.filter((card) => card.outstanding > 0) : cards;
}

function isReady(a: {
  showCardChoice: boolean;
  showAmountField: boolean;
  card: DemoCard | undefined;
  amount: number | undefined;
  problem: string | undefined;
}): boolean {
  const cardOk = !a.showCardChoice || a.card !== undefined;
  const amountOk = !a.showAmountField || (a.amount !== undefined && a.problem === undefined);
  return cardOk && amountOk;
}

/** The inputs a what-if needs before it can run: a card, an amount, or both. */
export function WhatIfConfigure({ tile, cards, onRun, onBack }: WhatIfConfigureProps) {
  const choices = pickableCards(tile, cards);
  const [cardId, setCardId] = useState<string>(choices[0]?.id ?? '');
  const [digits, setDigits] = useState('');
  const showCardChoice = tile !== 'fd-card';
  const showAmountField = tile !== 'close-card';
  const amount = toAmount(digits);
  const card = choices.find((c) => c.id === cardId) ?? choices[0];
  const emptyMessage = nothingToPick(tile, cards, choices);
  const problem = tile === 'close-card' ? undefined : amountProblem(tile, amount, card);
  const ready =
    emptyMessage === undefined &&
    isReady({ showCardChoice, showAmountField, card, amount, problem });
  return (
    <>
      <TextAction label="Back to score" onPress={onBack} testID="score-whatif-back" />
      <Text variant="overline">{COPY[tile].overline}</Text>
      <Text variant="h1">{COPY[tile].title}</Text>
      {emptyMessage ? (
        <Text variant="body" color="warning" testID="score-nothing-to-pick">
          {emptyMessage}
        </Text>
      ) : null}
      {showCardChoice && choices.length > 0 ? (
        <ChoiceRows
          options={cardOptions(choices)}
          value={card?.id ?? ''}
          onChange={setCardId}
          testID="score-card-choice"
        />
      ) : null}
      {showAmountField ? (
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
        onPress={() => onRun({ cardId: showCardChoice ? card?.id : undefined, amount })}
        testID="score-whatif-go"
      />
    </>
  );
}

function nothingToPick(
  tile: WhatIfConfigureProps['tile'],
  cards: readonly DemoCard[],
  choices: readonly DemoCard[],
): string | undefined {
  if (choices.length > 0) return undefined;
  if (tile === 'fd-card') return undefined;
  if (cards.length === 0) return 'You have no cards to try this on.';
  return `Nothing is outstanding on ${cards.map((c) => c.name).join(', ')}.`;
}
