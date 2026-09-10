import { isMap, isSeq, isScalar, parseDocument, type Node } from 'yaml';
import { formatFormula } from './format';
import { lex } from './lexer';
import { SyntaxFailure, type FormatOptions, type OutlineEntry } from './types';

/** Edit only formula scalar ranges; never reserialize the surrounding Power Apps document. */
export function formatYaml(source: string, options: FormatOptions): { text: string; outline: OutlineEntry[] } {
  const document = parseDocument(source, { keepSourceTokens: true, schema: 'failsafe', uniqueKeys: true });
  if (document.errors.length) {
    const error = document.errors[0];
    throw new SyntaxFailure(error.message, error.pos[0], error.pos[1]);
  }
  const edits: { from: number; to: number; text: string }[] = [];
  const outline: OutlineEntry[] = [];
  function visit(node: Node | null, path: string[], property = false): void {
    if (isMap(node)) {
      for (const pair of node.items) {
        const key = String(isScalar(pair.key) ? pair.key.value : '');
        if (!key) continue;
        const next = [...path, key];
        visit(pair.value as Node | null, next, property || key === 'Properties');
      }
    } else if (isSeq(node)) {
      node.items.forEach((item, i) => visit(item as Node | null, [...path, String(i)], property));
    } else if (isScalar(node) && typeof node.value === 'string' && property && node.value.startsWith('=')) {
      const range = node.range;
      if (!range) return;
      const from = range[0], to = range[1];
      const label = path.filter(p => !/^\d+$/.test(p) && !['Properties', 'Children', 'Screens'].includes(p)).join(' › ');
      outline.push({ label, from, to });
      let formatted: string;
      try { formatted = '=' + formatFormula(node.value.slice(1), { ...options, mode: 'powerapps', locale: 'dot' }); }
      catch (error) {
        if (error instanceof SyntaxFailure) throw new SyntaxFailure(`${label}: ${error.message}`, from, to);
        throw error;
      }
      // Preserve final line breaks: they can be part of the scalar's value.
      const suffix = node.value.match(/(?:\r?\n)+$/)?.[0] ?? '';
      formatted += suffix;
      if (formatted === node.value) return;
      const raw = source.slice(from, to);
      const lineStart = source.lastIndexOf('\n', from - 1) + 1;
      const baseIndent = source.slice(lineStart, from).match(/^[\t ]*/)?.[0] ?? '';
      const newline = source.includes('\r\n') ? '\r\n' : '\n';
      let replacement: string;
      if (node.type === 'QUOTE_DOUBLE') replacement = JSON.stringify(formatted);
      else if (node.type === 'QUOTE_SINGLE') replacement = formatted.includes('\n') ? JSON.stringify(formatted) : "'" + formatted.replace(/'/g, "''") + "'";
      else if (!formatted.includes('\n') && !/:\s|\s#/.test(formatted) && node.type === 'PLAIN') replacement = formatted;
      else {
        const trailing = formatted.match(/\n+$/)?.[0].length ?? 0;
        const indicator = trailing === 0 ? '|-' : trailing === 1 ? '|' : '|+';
        const headerComment = raw.match(/^[|>][^\r\n]*?(\s+#.*)(?:\r?\n)/)?.[1] ?? '';
        const body = formatted.replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n').map(line => baseIndent + '  ' + line).join(newline);
        replacement = indicator + headerComment + newline + body + newline.repeat(Math.max(1, trailing));
        // A plain scalar's range stops before its newline; consume no extra line here.
        if (node.type === 'PLAIN' && /[\r\n]/.test(source[to] ?? '')) replacement = replacement.replace(/\r?\n$/, '');
      }
      edits.push({ from, to, text: replacement });
    }
  }
  visit(document.contents, []);
  let text = source;
  for (const edit of edits.reverse()) text = text.slice(0, edit.from) + edit.text + text.slice(edit.to);
  const check = parseDocument(text, { schema: 'failsafe', uniqueKeys: true });
  if (check.errors.length) throw new SyntaxFailure('The formatted YAML could not be safely reconstructed. The original has been kept.', 0, source.length);
  // Compare formula tokens and final newlines, and every other value byte for byte.
  const stripFormulaWhitespace = (node: unknown, inProperties = false): unknown => {
    if (Array.isArray(node)) return node.map(x => stripFormulaWhitespace(x, inProperties));
    if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node).map(([k,v]) => [k, stripFormulaWhitespace(v, inProperties || k === 'Properties')]));
    if (inProperties && typeof node === 'string' && node.startsWith('=')) return { formulaTokens: lex(node.slice(1), 'dot').map(t => t.text), finalNewlines: node.match(/(?:\r?\n)+$/)?.[0] ?? '' };
    return node;
  };
  if (JSON.stringify(stripFormulaWhitespace(document.toJS({ maxAliasCount: 100 }))) !== JSON.stringify(stripFormulaWhitespace(check.toJS({ maxAliasCount: 100 })))) {
    throw new SyntaxFailure('YAML values changed unexpectedly. The original has been kept.', 0, source.length);
  }
  return { text, outline };
}
