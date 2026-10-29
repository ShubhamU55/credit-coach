import { View } from 'react-native';
import { PopButton, SecondaryButton, TextAction } from '../components/Buttons';
import { cardFinish, space } from '../theme';
import { Section, StateLabel } from './Section';

const noop = () => {};

export function ButtonsSection() {
  return (
    <Section id="buttons" title="Buttons">
      <StateLabel>Primary, screen CTA (56) with arrow</StateLabel>
      <PopButton label="Try sample profile" trailingArrow onPress={noop} testID="kit-pop-screen" />
      <StateLabel>Primary, in a list (48)</StateLabel>
      <PopButton label="Mark as paid" size="list" onPress={noop} testID="kit-pop-list" />
      <StateLabel>Primary, disabled</StateLabel>
      <PopButton label="Confirm payment" disabled onPress={noop} testID="kit-pop-disabled" />
      <StateLabel>Primary, on a card finish</StateLabel>
      <View
        style={{
          padding: space.heroPad,
          backgroundColor: cardFinish.plum.fill,
          borderWidth: 1,
          borderColor: cardFinish.plum.border,
        }}
      >
        <PopButton label="Mark as paid" onHero onPress={noop} testID="kit-pop-hero" />
      </View>
      <StateLabel>Secondary and secondary disabled</StateLabel>
      <SecondaryButton label="Undo" onPress={noop} testID="kit-secondary" />
      <SecondaryButton label="Create account" disabled onPress={noop} testID="kit-secondary-off" />
      <StateLabel>Text actions: link, on a finish, disabled</StateLabel>
      <TextAction label="View full plan →" onPress={noop} testID="kit-text-action" />
      <TextAction label="Manage" onFinish onPress={noop} testID="kit-text-action-finish" />
      <TextAction label="Sign in" disabled onPress={noop} testID="kit-text-action-off" />
    </Section>
  );
}
