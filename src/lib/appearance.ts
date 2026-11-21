import type { Preferences } from './types';

type Appearance = Pick<Preferences, 'theme' | 'palette' | 'customAccent'>;

declare global {
  interface Window {
    ompAppearance?: Appearance;
    ompApplyAppearance?: (appearance: Appearance) => void;
  }
}

export const startupAppearance: Appearance = globalThis.window?.ompAppearance ?? { theme: 'light', palette: 'obsidian' };

export function applyAppearance(appearance: Appearance) {
  window.ompApplyAppearance?.(appearance);
}
