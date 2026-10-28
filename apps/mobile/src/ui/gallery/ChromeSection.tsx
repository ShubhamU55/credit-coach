import { useState } from 'react';
import { View } from 'react-native';
import { BottomSheet } from '../components/BottomSheet';
import { PopButton } from '../components/Buttons';
import { FloatingNav, type NavTab } from '../components/FloatingNav';
import { Header } from '../components/Header';
import { Text } from '../primitives/Text';
import { announce } from '../primitives/announce';
import { Section, StateLabel } from './Section';

const noop = () => {};

export function ChromeSection() {
  const [tab, setTab] = useState<NavTab>('plan');
  const [sheetOpen, setSheetOpen] = useState(false);
  return (
    <Section id="chrome" title="App chrome">
      <StateLabel>Header with a new reminder and the sample strip</StateLabel>
      <Header
        initials="AM"
        remindersNew={1}
        onReminders={noop}
        onAccount={noop}
        sample={{ onSwitch: noop }}
      />
      <StateLabel>Header, nothing new, no sample</StateLabel>
      <Header initials="AM" remindersNew={0} onReminders={noop} onAccount={noop} />
      <StateLabel>
        Floating nav (interactive): shown inside a frame; the app pins it to the screen
      </StateLabel>
      <View testID="kit-nav-frame" style={{ minHeight: 108 }}>
        <FloatingNav active={tab} onNavigate={setTab} />
      </View>
      <StateLabel>Bottom sheet</StateLabel>
      <PopButton
        label="Open bottom sheet"
        size="list"
        onPress={() => setSheetOpen(true)}
        testID="kit-open-sheet"
      />
      <BottomSheet
        visible={sheetOpen}
        title="MARK AS PAID"
        subtitle="Axis Neo · due Thu, 22 Oct"
        onClose={() => setSheetOpen(false)}
      >
        <Text variant="numL" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          ₹12,400
        </Text>
        <Text variant="bodyS">This only records it here. Pay in your bank or UPI app.</Text>
        <PopButton
          label="Confirm payment"
          onPress={() => {
            announce('Recorded ₹12,400.');
            setSheetOpen(false);
          }}
          testID="kit-sheet-confirm"
        />
      </BottomSheet>
    </Section>
  );
}
