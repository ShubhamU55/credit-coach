import { fireEvent, render, screen } from '@testing-library/react-native';
import { createRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { color, shadow } from '../theme';
import { AmountInput, type AmountInputHandle } from './AmountInput';
import { ChoiceRows } from './ChoiceRows';
import { SwitchRow } from './Switch';

afterEach(() => jest.restoreAllMocks());

function styleOf(testID: string) {
  // Decorative parts (track, thumb, tick) are hidden from screen readers on purpose.
  return StyleSheet.flatten(
    screen.getByTestId(testID, { includeHiddenElements: true }).props.style,
  );
}

describe('SwitchRow', () => {
  const baseProps = {
    title: 'Aim for 10% utilization',
    captionOn: 'Only 10% gets reported.',
    captionOff: 'Staying under 30%.',
    testID: 'sw',
  };

  test('pressing calls onValueChange with the opposite value', async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow {...baseProps} value={false} onValueChange={onValueChange} />);

    await fireEvent.press(screen.getByRole('switch'));

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  test('pressing when on turns it off', async () => {
    const onValueChange = jest.fn();
    await render(<SwitchRow {...baseProps} value onValueChange={onValueChange} />);

    await fireEvent.press(screen.getByRole('switch'));

    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  test('the whole row is the switch and reports the checked state', async () => {
    await render(<SwitchRow {...baseProps} value onValueChange={() => {}} />);

    expect(screen.getByRole('switch', { checked: true })).toBeOnTheScreen();
    expect(screen.getByRole('switch')).toBeChecked();
  });

  test('reports unchecked when off', async () => {
    await render(<SwitchRow {...baseProps} value={false} onValueChange={() => {}} />);

    expect(screen.getByRole('switch')).not.toBeChecked();
  });

  test('shows captionOn when on and captionOff when off', async () => {
    await render(<SwitchRow {...baseProps} value onValueChange={() => {}} />);
    expect(screen.getByText('Only 10% gets reported.')).toBeOnTheScreen();
    expect(screen.queryByText('Staying under 30%.')).toBeNull();

    await screen.rerender(<SwitchRow {...baseProps} value={false} onValueChange={() => {}} />);

    expect(screen.getByText('Staying under 30%.')).toBeOnTheScreen();
    expect(screen.queryByText('Only 10% gets reported.')).toBeNull();
  });

  test('is at least 72 tall with a square 56 by 30 track', async () => {
    await render(<SwitchRow {...baseProps} value={false} onValueChange={() => {}} />);

    expect(styleOf('sw').minHeight).toBeGreaterThanOrEqual(72);
    expect(styleOf('sw-track')).toMatchObject({ width: 56, height: 30 });
    expect(styleOf('sw-track').borderRadius ?? 0).toBe(0);
    expect(styleOf('sw-thumb')).toMatchObject({ width: 22, height: 22 });
    expect(styleOf('sw-thumb').borderRadius ?? 0).toBe(0);
  });

  test('the hint equals the caption that is currently shown', async () => {
    await render(<SwitchRow {...baseProps} value onValueChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveProp('accessibilityHint', baseProps.captionOn);

    await screen.rerender(<SwitchRow {...baseProps} value={false} onValueChange={() => {}} />);

    expect(screen.getByRole('switch')).toHaveProp('accessibilityHint', baseProps.captionOff);
  });

  test('toggling on announces the new caption to screen readers', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    // RN's jest setup already mocks it, so earlier tests' calls are still recorded.
    announce.mockClear();
    await render(<SwitchRow {...baseProps} value={false} onValueChange={() => {}} />);

    await fireEvent.press(screen.getByRole('switch'));

    expect(announce).toHaveBeenCalledWith(baseProps.captionOn);
  });

  test('toggling off announces the off caption', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    // RN's jest setup already mocks it, so earlier tests' calls are still recorded.
    announce.mockClear();
    await render(<SwitchRow {...baseProps} value onValueChange={() => {}} />);

    await fireEvent.press(screen.getByRole('switch'));

    expect(announce).toHaveBeenCalledWith(baseProps.captionOff);
  });

  test('pressing underlines the title so the cue is not colour alone', async () => {
    await render(<SwitchRow {...baseProps} value={false} onValueChange={() => {}} />);

    await fireEvent(screen.getByRole('switch'), 'pressIn');

    expect(
      StyleSheet.flatten(screen.getByText(baseProps.title).props.style).textDecorationLine,
    ).toBe('underline');
  });

  test('disabled does not fire or announce, reports disabled and is dimmed', async () => {
    const onValueChange = jest.fn();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    // RN's jest setup already mocks it, so earlier tests' calls are still recorded.
    announce.mockClear();
    await render(<SwitchRow {...baseProps} disabled value onValueChange={onValueChange} />);

    await fireEvent.press(screen.getByRole('switch'));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(announce).not.toHaveBeenCalled();
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(styleOf('sw').opacity).toBe(0.5);
  });

  test.each([false, true])('the thumb stays inside the track when value is %s', async (value) => {
    await render(<SwitchRow {...baseProps} value={value} onValueChange={() => {}} />);
    const { left, width } = styleOf('sw-thumb');
    const track = styleOf('sw-track');
    const inner = track.width - 2 * (track.borderWidth ?? 0);

    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + width).toBeLessThanOrEqual(inner);
  });

  test('off: surface2 track with a line border and an ink thumb', async () => {
    await render(<SwitchRow {...baseProps} value={false} onValueChange={() => {}} />);

    expect(styleOf('sw-track')).toMatchObject({
      backgroundColor: color.surface2,
      borderColor: color.line,
    });
    expect(styleOf('sw-thumb')).toMatchObject({
      backgroundColor: color.ink,
      boxShadow: shadow.switchThumbOff,
    });
  });

  test('on: accent track and a bg thumb with the accentEdge shadow', async () => {
    await render(<SwitchRow {...baseProps} value onValueChange={() => {}} />);

    expect(styleOf('sw-track').backgroundColor).toBe(color.accent);
    expect(styleOf('sw-thumb')).toMatchObject({
      backgroundColor: color.bg,
      boxShadow: shadow.switchThumbOn,
    });
  });

  test('the thumb sits at opposite ends of the track when on and off', async () => {
    await render(<SwitchRow {...baseProps} value={false} onValueChange={() => {}} />);
    const offLeft = styleOf('sw-thumb').left;

    await screen.rerender(<SwitchRow {...baseProps} value onValueChange={() => {}} />);

    expect(styleOf('sw-thumb').left).toBeGreaterThan(offLeft);
  });
});

describe('ChoiceRows', () => {
  const options = [
    { key: 'full', label: 'Full statement', sub: 'Zero interest', amount: '₹15,600' },
    { key: 'min', label: 'Minimum due', sub: 'Avoids a late fee', amount: '₹620' },
    { key: 'other', label: 'Other amount', sub: 'Pay what you like', amount: '' },
  ];

  test('renders a radiogroup with one radio per option', async () => {
    await render(<ChoiceRows options={options} value="full" onChange={() => {}} />);

    // Not `accessible`: grouping must not swallow the radios inside it.
    expect(screen.getByTestId('choice-rows')).toHaveProp('accessibilityRole', 'radiogroup');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  test('only the selected row is checked and shows the tick', async () => {
    await render(<ChoiceRows options={options} value="min" onChange={() => {}} />);

    expect(screen.getByRole('radio', { name: /Minimum due/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Full statement/ })).not.toBeChecked();
    expect(screen.getAllByText('✓', { includeHiddenElements: true })).toHaveLength(1);
  });

  test('pressing another row calls onChange with its key', async () => {
    const onChange = jest.fn();
    await render(<ChoiceRows options={options} value="full" onChange={onChange} />);

    await fireEvent.press(screen.getByRole('radio', { name: /Minimum due/ }));

    expect(onChange).toHaveBeenCalledWith('min');
  });

  test('every row is at least 52 tall and square', async () => {
    await render(<ChoiceRows options={options} value="full" onChange={() => {}} testID="cr" />);

    for (const o of options) {
      expect(styleOf(`cr-${o.key}`).minHeight).toBeGreaterThanOrEqual(52);
      expect(styleOf(`cr-${o.key}`).borderRadius ?? 0).toBe(0);
    }
  });

  test('selected is accent filled; unselected is transparent with a line border', async () => {
    await render(<ChoiceRows options={options} value="full" onChange={() => {}} testID="cr" />);

    expect(styleOf('cr-full').backgroundColor).toBe(color.accent);
    expect(styleOf('cr-min')).toMatchObject({
      backgroundColor: 'transparent',
      borderColor: color.line,
      borderWidth: 1,
    });
  });

  test('uses an 18 square tick box, not a round radio dot', async () => {
    await render(<ChoiceRows options={options} value="full" onChange={() => {}} testID="cr" />);

    expect(styleOf('cr-full-tick')).toMatchObject({ width: 18, height: 18 });
    expect(styleOf('cr-full-tick').borderRadius ?? 0).toBe(0);
  });

  test('the accessible name carries the label, sub-line and amount', async () => {
    await render(<ChoiceRows options={options} value="full" onChange={() => {}} />);

    expect(screen.getAllByRole('radio')[0]).toHaveProp(
      'accessibilityLabel',
      'Full statement, Zero interest, ₹15,600',
    );
  });

  test('an amount never wraps or shrinks away', async () => {
    await render(<ChoiceRows options={options} value="full" onChange={() => {}} />);

    const amount = screen.getByText('₹15,600');
    expect(amount).toHaveProp('numberOfLines', 1);
    expect(StyleSheet.flatten(amount.props.style).flexShrink).toBe(0);
  });

  test('pressing thickens the row border, and releasing restores it', async () => {
    await render(<ChoiceRows options={options} value="full" onChange={() => {}} testID="cr" />);

    await fireEvent(screen.getByTestId('cr-min'), 'pressIn');
    expect(styleOf('cr-min').borderWidth).toBe(2);
    await fireEvent(screen.getByTestId('cr-min'), 'pressOut');

    expect(styleOf('cr-min').borderWidth).toBe(1);
  });

  test('disabled rows do not fire, report disabled and are dimmed with a dashed border', async () => {
    const onChange = jest.fn();
    await render(
      <ChoiceRows options={options} value="full" onChange={onChange} disabled testID="cr" />,
    );

    await fireEvent.press(screen.getByTestId('cr-min'));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('cr-min')).toBeDisabled();
    expect(styleOf('cr-min')).toMatchObject({ opacity: 0.5, borderStyle: 'dashed' });
  });

  test('shows the label, sub-line and amount of each option', async () => {
    await render(<ChoiceRows options={options} value="full" onChange={() => {}} />);

    expect(screen.getByText('Zero interest')).toBeOnTheScreen();
    expect(screen.getByText('₹620')).toBeOnTheScreen();
  });
});

describe('AmountInput', () => {
  const baseProps = {
    label: 'Amount you paid',
    value: '620',
    onChangeText: () => {},
    testID: 'ai',
  };

  test('is a number-pad input with a rupee prefix and an accessible label', async () => {
    await render(<AmountInput {...baseProps} />);

    expect(screen.getByTestId('ai').props.keyboardType).toBe('number-pad');
    expect(screen.getByText('₹')).toBeOnTheScreen();
    expect(screen.getByLabelText('Amount you paid, in rupees')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('620')).toBeOnTheScreen();
  });

  test('default status: 1px line border', async () => {
    await render(<AmountInput {...baseProps} />);

    expect(styleOf('ai-field')).toMatchObject({ borderWidth: 1, borderColor: color.line });
  });

  test('error: 2px error border and the message in the error color', async () => {
    await render(
      <AmountInput {...baseProps} status="error" message="Enter the amount you paid." />,
    );

    expect(styleOf('ai-field')).toMatchObject({ borderWidth: 2, borderColor: color.error });
    expect(screen.getByText('Enter the amount you paid.')).toBeOnTheScreen();
    expect(styleOf('ai-message').color).toBe(color.error);
  });

  test('warning: 2px warning border and the message in the warning color', async () => {
    await render(
      <AmountInput {...baseProps} status="warning" message="⚠ ₹120 short of the ₹620 minimum." />,
    );

    expect(styleOf('ai-field')).toMatchObject({ borderWidth: 2, borderColor: color.warning });
    expect(styleOf('ai-message').color).toBe(color.warning);
  });

  test('shows the helper line, and an empty live region when there is no message', async () => {
    await render(<AmountInput {...baseProps} helper="Outstanding ₹15,600" />);

    expect(screen.getByText('Outstanding ₹15,600')).toBeOnTheScreen();
    expect(screen.getByTestId('ai-message')).toHaveTextContent('');
  });

  test('the live region is always mounted and only its text changes when an error appears', async () => {
    await render(<AmountInput {...baseProps} />);
    expect(screen.getByTestId('ai-message')).toHaveProp('accessibilityLiveRegion', 'polite');

    await screen.rerender(
      <AmountInput {...baseProps} status="error" message="Enter the amount." />,
    );

    expect(screen.getByTestId('ai-message')).toHaveTextContent('Enter the amount.');
    expect(screen.getByTestId('ai-message')).toHaveProp('accessibilityLiveRegion', 'polite');
  });

  test('the error is read once: the live region carries it and the input has no duplicate hint', async () => {
    await render(<AmountInput {...baseProps} status="error" message="Enter the amount." />);
    expect(screen.getByTestId('ai').props.accessibilityHint).toBeUndefined();
    expect(screen.getByTestId('ai-message')).toHaveProp('accessibilityLiveRegion', 'polite');
    expect(screen.getByTestId('ai-message')).toHaveTextContent('Enter the amount.');
  });

  test.each([
    ['₹1,200.50', '1200'],
    ['1,2a3.5', '123'],
    ['₹12,00,000', '1200000'],
    ['.75', ''],
    ['007', '7'],
    ['0', '0'],
    ['000', '0'],
    ['', ''],
  ])('sanitises %j to %j', async (typed, expected) => {
    const onChangeText = jest.fn();
    await render(<AmountInput {...baseProps} onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByTestId('ai'), typed);

    expect(onChangeText).toHaveBeenCalledWith(expected);
  });

  test('rejects a paste of more than 9 digits instead of truncating it into a wrong amount', async () => {
    const onChangeText = jest.fn();
    await render(<AmountInput {...baseProps} onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByTestId('ai'), '1234567890');

    expect(onChangeText).not.toHaveBeenCalled();
  });

  test('accepts exactly 9 digits', async () => {
    const onChangeText = jest.fn();
    await render(<AmountInput {...baseProps} onChangeText={onChangeText} />);

    await fireEvent.changeText(screen.getByTestId('ai'), '999999999');

    expect(onChangeText).toHaveBeenCalledWith('999999999');
  });

  test('a controlled input DISPLAYS the sanitised text after a messy paste', async () => {
    function Controlled() {
      const [value, setValue] = useState('');
      return <AmountInput label="Amount" value={value} onChangeText={setValue} testID="ai" />;
    }
    await render(<Controlled />);

    await fireEvent.changeText(screen.getByTestId('ai'), '₹1,200.50');

    expect(screen.getByDisplayValue('1200')).toBeOnTheScreen();
    expect(screen.queryByDisplayValue('120050')).toBeNull();
  });

  test('a controlled input keeps the old text when an over-long paste is rejected', async () => {
    function Controlled() {
      const [value, setValue] = useState('500');
      return <AmountInput label="Amount" value={value} onChangeText={setValue} testID="ai" />;
    }
    await render(<Controlled />);

    await fireEvent.changeText(screen.getByTestId('ai'), '12345678901');

    expect(screen.getByDisplayValue('500')).toBeOnTheScreen();
  });

  test('the whole field, including the rupee prefix, is a 48dp target that focuses the input', async () => {
    const ref = createRef<AmountInputHandle>();
    await render(<AmountInput {...baseProps} ref={ref} />);
    const focus = jest.spyOn(ref.current as AmountInputHandle, 'focus');

    await fireEvent.press(screen.getByTestId('ai-field'));

    expect(focus).toHaveBeenCalledTimes(1);
    expect(styleOf('ai-field').minHeight).toBeGreaterThanOrEqual(48);
    expect(styleOf('ai')).toMatchObject({ alignSelf: 'stretch', minHeight: 48 });
  });

  test('forwards a ref to the TextInput so a screen can focus it from an EDIT action', async () => {
    const ref = createRef<AmountInputHandle>();
    await render(<AmountInput {...baseProps} ref={ref} />);

    expect(ref.current).not.toBeNull();
    expect(typeof ref.current?.focus).toBe('function');
  });

  test('the boxed field has a minimum height of 50, not a fixed height, and square corners', async () => {
    await render(<AmountInput {...baseProps} />);

    expect(styleOf('ai-field').minHeight).toBe(50);
    expect(styleOf('ai-field').height).toBeUndefined();
    expect(styleOf('ai-field').borderRadius ?? 0).toBe(0);
  });

  test('inline variant is borderless', async () => {
    await render(<AmountInput {...baseProps} inline />);

    expect(styleOf('ai-field').borderWidth ?? 0).toBe(0);
  });
});
