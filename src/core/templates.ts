import { findInterpolationEnd } from './lexer';
import { formatFormula } from './format';
import { SyntaxFailure, type FormatOptions } from './types';

function nested(source: string, start: number, end: number, options: FormatOptions, cloud: boolean): string {
  const content = source.slice(start, end);
  try {
    if (!content.trim()) throw new SyntaxFailure('Expected an expression.', 0, content.length);
    return formatFormula(content, options, cloud);
  } catch (error) {
    if (error instanceof SyntaxFailure) throw new SyntaxFailure(error.message, start + error.from, start + error.to);
    throw error;
  }
}
export function formatTemplate(source: string, options: FormatOptions, cloud: boolean): string {
  const trimmed = source.trim();
  const offset = source.indexOf(trimmed);
  if (!cloud && trimmed.startsWith('=')) return '=' + nested(source, offset + 1, offset + trimmed.length, options, false);
  if (cloud && trimmed.startsWith('@') && !trimmed.startsWith('@{') && !trimmed.startsWith('@@')) {
    return '@' + nested(source, offset + 1, offset + trimmed.length, options, true);
  }
  const opener = cloud ? '@{' : '${';
  if (!source.includes(opener)) return cloud ? formatFormula(source, options, true) : source;
  let result = '', cursor = 0;
  for (let i = 0; i < source.length; i++) {
    if (cloud && source.slice(i, i + 2) === '@@') { i++; continue; }
    if (!cloud && source.slice(i, i + 3) === '$${') { i += 2; continue; }
    if (source.slice(i, i + 2) !== opener) continue;
    const end = findInterpolationEnd(source, i + 2, cloud);
    result += source.slice(cursor, i + 2) + nested(source, i + 2, end, options, cloud) + '}';
    cursor = end + 1; i = end;
  }
  return result + source.slice(cursor);
}
