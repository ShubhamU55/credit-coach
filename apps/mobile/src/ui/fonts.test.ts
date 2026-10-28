import { useFonts } from 'expo-font';
import { fontFamily, useAppFonts } from './fonts';

jest.mock('expo-font', () => ({ useFonts: jest.fn() }));
const mockUseFonts = useFonts as jest.MockedFunction<typeof useFonts>;

describe('useAppFonts', () => {
  afterEach(() => jest.restoreAllMocks());

  test('registers exactly the seven families the type scale refers to', () => {
    mockUseFonts.mockReturnValue([true, null]);

    useAppFonts();

    const map = mockUseFonts.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(map).sort()).toEqual(Object.values(fontFamily).sort());
  });

  test('is false while fonts are loading', () => {
    mockUseFonts.mockReturnValue([false, null]);
    expect(useAppFonts()).toBe(false);
  });

  test('is true once fonts are loaded', () => {
    mockUseFonts.mockReturnValue([true, null]);
    expect(useAppFonts()).toBe(true);
  });

  test('is true after a load error, with a warning, so the app never hangs on a blank screen', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockUseFonts.mockReturnValue([false, new Error('boom')]);

    expect(useAppFonts()).toBe(true);
    expect(warn).toHaveBeenCalled();
  });
});
