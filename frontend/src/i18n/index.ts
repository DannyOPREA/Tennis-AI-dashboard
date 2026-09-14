import { type Dictionary, en } from "./en";

/**
 * Tiny i18n: `t` is the active dictionary. A French dictionary can be added
 * later as `fr.ts` implementing `Dictionary`; swap here (or via a setting).
 */
export const t: Dictionary = en;
export type { Dictionary };
