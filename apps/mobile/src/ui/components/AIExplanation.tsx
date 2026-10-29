import { View } from 'react-native';
import { Text } from '../primitives/Text';
import { color } from '../theme';

export type AIExplanationProps = {
  /** Words the engine's numbers. The LLM never produces an amount, date or percent. */
  text: string;
  /** False when the template fallback is shown (LLM failed or timed out). */
  aiWritten: boolean;
};

/** Fixed copy, design.md 6.16 and 1. */
export const AI_LABEL = '✦ WHY THIS PLAN · AI-WRITTEN';
export const TEMPLATE_LABEL = 'WHY THIS PLAN';

/** "Why this plan" block (design.md 6.16): 2px accent rule, labelled, Fraunces voice body. */
export function AIExplanation({ text, aiWritten }: AIExplanationProps) {
  return (
    <View
      testID="ai-explanation"
      style={{ borderLeftWidth: 2, borderLeftColor: color.accent, paddingLeft: 14, gap: 8 }}
    >
      <Text
        variant="overline"
        color="info"
        accessibilityLabel={aiWritten ? 'Why this plan, AI-written' : 'Why this plan'}
      >
        {aiWritten ? AI_LABEL : TEMPLATE_LABEL}
      </Text>
      <Text variant="voice" color="ink">
        {text}
      </Text>
    </View>
  );
}
