// The kit barrel. Screens import from here with a relative path (`import { PopButton } from '../ui'`).
// There is no `@/ui` alias: tsconfig has no `paths` and Jest has no `moduleNameMapper`.

// theme
export {
  color,
  cardFinish,
  scoreZone,
  finishForIndex,
  shadow,
  noShadow,
  space,
  type,
  fontFamily,
} from './theme';
export type { CardFinish, ShadowKind, TypeRole } from './theme';
export { overlay, kitShadow } from './theme/kitB';
export { useAppFonts } from './fonts';

// primitives
export { Text } from './primitives/Text';
export type { TextProps, TextColor } from './primitives/Text';
export { PopPressable } from './primitives/PopPressable';
export type { PopPressableProps, PopShadowKind } from './primitives/PopPressable';
export { useReduceMotion } from './primitives/useReduceMotion';
export { usePressed } from './primitives/usePressed';
export { clampPercent, percentStyle } from './primitives/percent';

// components: buttons and form controls
export { PopButton, SecondaryButton, TextAction } from './components/Buttons';
export { SwitchRow } from './components/Switch';
export { ChoiceRows } from './components/ChoiceRows';
export type { ChoiceOption } from './components/ChoiceRows';
export { AmountInput } from './components/AmountInput';
export type { AmountInputHandle, AmountStatus } from './components/AmountInput';

// components: information blocks
export { StatusChip } from './components/StatusChip';
export type { StatusChipProps, StatusChipVariant } from './components/StatusChip';
export { Disclaimer, DISCLAIMER_TEXT } from './components/Disclaimer';
export { SampleStrip } from './components/SampleStrip';
export { AIExplanation, AI_LABEL, TEMPLATE_LABEL } from './components/AIExplanation';
export { ReasonRow } from './components/ReasonRow';
export type { ReasonDirection } from './components/ReasonRow';
export { StatTile } from './components/StatTile';
export { UtilizationLabel, isOverThreshold } from './components/UtilizationLabel';

// components: plan visuals
export { BeforeAfterBar } from './components/BeforeAfterBar';
export { PlanStepCard } from './components/PlanStepCard';
export type { PlanStepCardProps, PlanStepState } from './components/PlanStepCard';
export { DateBlockTimeline } from './components/DateBlockTimeline';
export type { DateBlockItem } from './components/DateBlockTimeline';
export { PaymentTimelineStrip, windowPercent } from './components/PaymentTimelineStrip';
export type { TimelineLane } from './components/PaymentTimelineStrip';

// components: score visuals
export { ScoreRangeText } from './components/ScoreRangeText';
export { ScoreCard } from './components/ScoreCard';
export type { ScoreCardProps, ScoreZoneSpec } from './components/ScoreCard';
export { WhatIfTile } from './components/WhatIfTile';
