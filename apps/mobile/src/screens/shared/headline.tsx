import { Text, fontFamily, type TypeRole } from '../../ui';

/** Past this font scale, side-by-side blocks stack so a range or label never shrinks or wraps. */
export const STACK_FONT_SCALE = 1.3;

/** The italic "so what" in a Fraunces headline (design.md 9). Not a second heading. */
export function Italic({ children, variant = 'h1' }: { children: string; variant?: TypeRole }) {
  return (
    <Text
      variant={variant}
      accessibilityRole={undefined}
      style={{ fontFamily: fontFamily.serifItalic }}
    >
      {children}
    </Text>
  );
}
