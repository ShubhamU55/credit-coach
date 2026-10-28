import { StyleSheet, Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { color, type, type TypeRole } from '../theme';

export type TextColor = keyof typeof color;

export type TextProps = RNTextProps & {
  variant: TypeRole;
  /** A color token. Defaults by variant: ink for headings and numbers, body for paragraphs, muted for small labels. */
  color?: TextColor;
  /** Tabular figures. Defaults to true for the `num*` variants. */
  tabular?: boolean;
};

const MUTED_VARIANTS: readonly TypeRole[] = ['caption', 'overline', 'micro'];
const BODY_VARIANTS: readonly TypeRole[] = ['body', 'bodyS', 'voice'];

function defaultColor(variant: TypeRole): TextColor {
  if (MUTED_VARIANTS.includes(variant)) return 'muted';
  if (BODY_VARIANTS.includes(variant)) return 'body';
  if (variant === 'estimateTag') return 'link';
  return 'ink';
}

/** Typography primitive: one component for every role in docs/design.md 3.2. */
export function Text({ variant, color: colorToken, tabular, style, ...rest }: TextProps) {
  const isTabular = tabular ?? variant.startsWith('num');
  return (
    <RNText
      accessibilityRole={variant === 'h1' ? 'header' : undefined}
      {...rest}
      style={StyleSheet.flatten([
        type[variant],
        { color: color[colorToken ?? defaultColor(variant)] },
        { fontVariant: isTabular ? ['tabular-nums'] : undefined },
        style,
      ])}
    />
  );
}
