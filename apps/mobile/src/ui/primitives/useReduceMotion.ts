import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the user asked the system to reduce motion (design.md section 10).
 * When true: skip slides, bar fills and any press tween; jump straight to the end state.
 * Starts as false and updates once the system setting is read. A change event that arrives
 * before the initial read finishes wins over the (now stale) initial value.
 */
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    let sawChangeEvent = false;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (active && !sawChangeEvent) setReduceMotion(enabled);
      },
      () => {
        // Cannot read the setting: keep the default (motion allowed).
      },
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      sawChangeEvent = true;
      setReduceMotion(enabled);
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
}
