import type { TextStyle } from 'react-native';
import { fontFamily } from './fontFamily';

const tabular: TextStyle['fontVariant'] = ['tabular-nums'];

// docs/design.md section 3.2. Letter-spacing is already converted to RN points (em x size).
// Fraunces never appears below 18px and never on a number or a button.
export const type = {
  display: {
    fontFamily: fontFamily.serif,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.0,
  },
  h1: {
    fontFamily: fontFamily.serif,
    fontSize: 34,
    lineHeight: 38,
    letterSpacing: -0.7,
  },
  confirmation: {
    fontFamily: fontFamily.serif,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  voice: {
    fontFamily: fontFamily.serif,
    fontSize: 18,
    lineHeight: 26,
    letterSpacing: 0,
  },
  estimateTag: {
    fontFamily: fontFamily.serifItalic,
    fontSize: 20,
    lineHeight: 24,
    letterSpacing: 0,
  },
  numXL: {
    fontFamily: fontFamily.sans800,
    fontSize: 64,
    lineHeight: 66,
    letterSpacing: -3.2,
    fontVariant: tabular,
  },
  numL: {
    fontFamily: fontFamily.sans800,
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -2.2,
    fontVariant: tabular,
  },
  numM: {
    fontFamily: fontFamily.sans800,
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.9,
    fontVariant: tabular,
  },
  numS: {
    fontFamily: fontFamily.sans800,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.66,
    fontVariant: tabular,
  },
  numXS: {
    fontFamily: fontFamily.sans800,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: 0,
    fontVariant: tabular,
  },
  title: {
    fontFamily: fontFamily.sans700,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
  },
  body: {
    fontFamily: fontFamily.sans400,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
  },
  bodyS: {
    fontFamily: fontFamily.sans400,
    fontSize: 13,
    lineHeight: 19,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: fontFamily.sans400,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  overline: {
    fontFamily: fontFamily.sans700,
    fontSize: 11,
    lineHeight: 16,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  button: {
    fontFamily: fontFamily.sans800,
    fontSize: 14,
    lineHeight: 18,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  buttonS: {
    fontFamily: fontFamily.sans800,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  micro: {
    fontFamily: fontFamily.sans800,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
  },
} as const satisfies Record<string, TextStyle>;

export type TypeRole = keyof typeof type;
