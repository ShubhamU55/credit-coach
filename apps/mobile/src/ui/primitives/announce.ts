import { AccessibilityInfo } from 'react-native';

/**
 * Tell a screen reader something changed (design.md 10): after recording a payment, Undo and
 * switch changes. A thin wrapper so screens and tests share one entry point.
 */
export function announce(message: string): void {
  AccessibilityInfo.announceForAccessibility(message);
}
