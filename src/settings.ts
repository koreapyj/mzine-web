import { GM_getValue, GM_setValue } from '$';

export interface Settings {
  dual: boolean;
  fit: 'height' | 'width';
  intercept: boolean;
}

const KEY = 'settings';
const DEFAULTS: Settings = { dual: true, fit: 'height', intercept: true };

export function loadSettings(): Settings {
  let stored: Partial<Settings> | null = null;
  try {
    stored = GM_getValue(KEY, null) as Partial<Settings> | null;
  } catch {
    stored = null;
  }
  const s = { ...DEFAULTS, ...(stored && typeof stored === 'object' ? stored : {}) };
  if (s.fit !== 'height' && s.fit !== 'width') s.fit = DEFAULTS.fit;
  return s;
}

export function saveSettings(patch: Partial<Settings>): void {
  GM_setValue(KEY, { ...loadSettings(), ...patch });
}
