import type { IsoDate } from './types';

/**
 * The fixed demo "today" (Wed 21 Oct 2026). The one place to change it: the app never
 * reads the device clock for planning, so the sample profile always matches the golden
 * fixture in docs/design.md section 8.
 */
export const DEMO_TODAY: IsoDate = '2026-10-21';
