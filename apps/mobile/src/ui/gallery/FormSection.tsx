import { useState } from 'react';
import { AmountInput } from '../components/AmountInput';
import { ChoiceRows } from '../components/ChoiceRows';
import { SwitchRow } from '../components/Switch';
import { Section, StateLabel } from './Section';

const noop = () => {};

type PayChoice = 'full' | 'minimum' | 'other';

const OPTIONS = [
  { key: 'full', label: 'Full statement', sub: 'Steps 01 + 03 · zero interest', amount: '₹12,400' },
  {
    key: 'minimum',
    label: 'Minimum only',
    sub: 'Step 01 · interest applies on the rest',
    amount: '₹620',
  },
  { key: 'other', label: 'Other amount', sub: 'Partial payment', amount: '' },
] as const;

export function FormSection() {
  const [tenPercent, setTenPercent] = useState(false);
  const [choice, setChoice] = useState<PayChoice>('full');
  const [amount, setAmount] = useState('12400');
  return (
    <Section id="form" title="Form controls">
      <StateLabel>Switch, interactive (off, then on)</StateLabel>
      <SwitchRow
        title="Aim for 10% utilization"
        captionOn="Only 10% gets reported. Uses more of your cash."
        captionOff="Staying under 30%. Keeps ₹31,000 left over."
        value={tenPercent}
        onValueChange={setTenPercent}
        testID="kit-switch"
      />
      <StateLabel>Switch, disabled</StateLabel>
      <SwitchRow
        title="Aim for 10% utilization"
        captionOn="Only 10% gets reported."
        captionOff="Staying under 30%."
        value={false}
        onValueChange={noop}
        disabled
        testID="kit-switch-off"
      />
      <StateLabel>Choice rows, interactive</StateLabel>
      <ChoiceRows
        options={[...OPTIONS]}
        value={choice}
        onChange={setChoice}
        testID="kit-choice-rows"
      />
      <StateLabel>Amount input, default</StateLabel>
      <AmountInput
        label="Amount paid"
        value={amount}
        onChangeText={setAmount}
        helper="Outstanding ₹15,600"
        testID="kit-amount"
      />
      <StateLabel>Amount input, error</StateLabel>
      <AmountInput
        label="Amount paid"
        value=""
        onChangeText={noop}
        status="error"
        message="Enter the amount you paid."
        testID="kit-amount-error"
      />
      <StateLabel>Amount input, warning</StateLabel>
      <AmountInput
        label="Amount paid"
        value="500"
        onChangeText={noop}
        status="warning"
        message="⚠ ₹120 short of the ₹620 minimum. This counts as a missed payment: pay the rest by 22 Oct."
        testID="kit-amount-warning"
      />
      <StateLabel>Amount input, inline (cash on Plan)</StateLabel>
      <AmountInput
        label="Cash for cards"
        value="120000"
        onChangeText={noop}
        inline
        testID="kit-amount-inline"
      />
    </Section>
  );
}
