import { useFonts } from 'expo-font';
import { Fraunces_400Regular } from '@expo-google-fonts/fraunces/400Regular';
import { Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces/400Regular_Italic';
import { Fraunces_600SemiBold } from '@expo-google-fonts/fraunces/600SemiBold';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { PlusJakartaSans_800ExtraBold } from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold';

export { fontFamily } from './theme/fontFamily';

/**
 * Loads the seven bundled static weights (design.md 3.1): Fraunces 400, 400 Italic, 600;
 * Plus Jakarta Sans 400, 600, 700, 800. Returns true once they are ready, or if loading failed,
 * so the app never hangs on a blank screen (the system font is the fallback).
 */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_600SemiBold,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  if (error) console.warn(`useAppFonts: font loading failed, using system fonts. ${error.message}`);
  return loaded || error !== null;
}
