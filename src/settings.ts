import { defaults, type FormatOptions } from './core/types';
export interface Settings extends FormatOptions {
  theme: 'dark' | 'light' | 'system';
  rememberSource: boolean;
  wordWrap: boolean;
  live: boolean;
}
export const initialSettings: Settings = {
  ...defaults,
  theme: 'dark',
  rememberSource: false,
  wordWrap: true,
  live: true,
};
const key = 'vrrdnt.powerfx.settings.v1';
const sourceKey = 'vrrdnt.powerfx.source.v1';
export function readSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '{}');
    const result = { ...initialSettings };
    for (const field of [
      'rememberSource',
      'wordWrap',
      'live',
      'useTabs',
      'preserveBlankLines',
    ] as const)
      if (typeof raw[field] === 'boolean') result[field] = raw[field];
    const enums = {
      mode: ['powerapps', 'yaml', 'cloud', 'desktop'],
      preset: ['adaptive', 'expanded', 'compact', 'custom'],
      locale: ['dot', 'comma'],
      theme: ['dark', 'light', 'system'],
      argumentLayout: ['auto', 'expanded'],
      recordLayout: ['auto', 'expanded'],
    };
    for (const [field, allowed] of Object.entries(enums))
      if (allowed.includes(raw[field])) Object.assign(result, { [field]: raw[field] });
    if ([2, 4, 8].includes(raw.indentSize)) result.indentSize = raw.indentSize;
    if (Number.isInteger(raw.printWidth) && raw.printWidth >= 40 && raw.printWidth <= 240)
      result.printWidth = raw.printWidth;
    return result;
  } catch {
    return { ...initialSettings };
  }
}
export function saveSettings(settings: Settings): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(settings));
    if (!settings.rememberSource) localStorage.removeItem(sourceKey);
    return true;
  } catch {
    return false;
  }
}
export function readSource(): string | null {
  try {
    return localStorage.getItem(sourceKey);
  } catch {
    return null;
  }
}
export function saveSource(source: string): boolean {
  try {
    localStorage.setItem(sourceKey, source);
    return true;
  } catch {
    return false;
  }
}
export function clearSaved(): void {
  try {
    localStorage.removeItem(sourceKey);
    localStorage.removeItem(key);
  } catch {
    /* storage may be disabled */
  }
}
