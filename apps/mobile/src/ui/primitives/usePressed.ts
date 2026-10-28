import { useState } from 'react';

/**
 * Tracks the pressed state from onPressIn/onPressOut so components can draw a visible,
 * non-colour pressed cue (underline, heavier border) from tokens.
 */
export function usePressed() {
  const [pressed, setPressed] = useState(false);
  return {
    pressed,
    handlers: {
      onPressIn: () => setPressed(true),
      onPressOut: () => setPressed(false),
    },
  };
}
