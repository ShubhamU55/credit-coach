/**
 * The Mark as paid sheet opens tall. At a 0.6 detent the content (about 1572 px on a 1080x2400
 * phone) overflowed the 1440 px sheet and Confirm sat under the 3-button navigation bar; at 0.9 and
 * up it is fully clear. Kept outside `src/app` (every file there is a route). Option names are the
 * react-native-screens formSheet props: `sheetAllowedDetents` and `sheetInitialDetentIndex`.
 */
export const MARK_PAID_SHEET_OPTIONS: {
  presentation: 'formSheet';
  sheetAllowedDetents: number[];
  sheetInitialDetentIndex: number;
} = {
  presentation: 'formSheet',
  sheetAllowedDetents: [0.9, 1],
  sheetInitialDetentIndex: 0,
};
