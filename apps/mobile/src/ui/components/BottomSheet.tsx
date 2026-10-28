import type { ReactNode } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { Text } from '../primitives/Text';
import { useReduceMotion } from '../primitives/useReduceMotion';
import { color, space } from '../theme';

export type BottomSheetProps = {
  visible: boolean;
  /** Overline, for example `MARK AS PAID`. */
  title: string;
  /** For example `Axis Neo · due Thu, 22 Oct`. */
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * Bottom sheet (design.md 6.19): a `Modal` over a scrim. The sheet is modal for screen readers and
 * Close comes first in render order, so it is first in focus order. Slides in; with reduce motion
 * on it fades instead (design.md 10: no slide).
 */
export function BottomSheet({ visible, title, subtitle, onClose, children }: BottomSheetProps) {
  const reduceMotion = useReduceMotion();
  return (
    <Modal
      testID="bottom-sheet-modal"
      visible={visible}
      transparent
      statusBarTranslucent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          testID="bottom-sheet-scrim"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={onClose}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            backgroundColor: color.scrim,
          }}
        />
        <View
          testID="bottom-sheet"
          accessibilityViewIsModal
          style={{
            maxHeight: '92%',
            paddingTop: 12,
            paddingHorizontal: space.gutter,
            paddingBottom: 28,
            gap: space.grid,
            backgroundColor: color.surface,
            borderTopWidth: 1,
            borderTopColor: color.line,
          }}
        >
          <View
            testID="bottom-sheet-grabber"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={{ alignSelf: 'center', width: 40, height: 4, backgroundColor: color.line }}
          />
          {/* row-reverse: Close is first in the tree (first in focus order) but sits on the right. */}
          <View style={{ flexDirection: 'row-reverse', alignItems: 'center', gap: space.grid }}>
            <Pressable
              testID="bottom-sheet-close"
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              style={{
                minWidth: space.touch,
                minHeight: space.touch,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: color.hairline,
              }}
            >
              <Text
                variant="title"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                ✕
              </Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text variant="overline" accessibilityRole="header">
                {title}
              </Text>
              {subtitle ? <Text variant="title">{subtitle}</Text> : null}
            </View>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ gap: space.grid }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
