export type Mode = 'powerapps' | 'yaml' | 'cloud' | 'desktop';
export type Preset = 'adaptive' | 'expanded' | 'compact' | 'custom';
export type Locale = 'dot' | 'comma';
export interface FormatOptions {
  mode: Mode;
  preset: Preset;
  indentSize: number;
  useTabs: boolean;
  printWidth: number;
  locale: Locale;
  argumentLayout: 'auto' | 'expanded';
  recordLayout: 'auto' | 'expanded';
  preserveBlankLines: boolean;
}
export interface Diagnostic { from: number; to: number; message: string; severity: 'error' | 'warning' }
export interface OutlineEntry { label: string; from: number; to: number }
export interface FormatResult { text: string; diagnostics: Diagnostic[]; durationMs: number; outline: OutlineEntry[] }
export const defaults: FormatOptions = { mode: 'powerapps', preset: 'adaptive', indentSize: 4, useTabs: false, printWidth: 100, locale: 'dot', argumentLayout: 'auto', recordLayout: 'auto', preserveBlankLines: true };
export class SyntaxFailure extends Error {
  constructor(message: string, public from: number, public to = from + 1) { super(message); }
}
