import { SyntaxFailure, type Locale } from './types';

export interface Token {
  kind: 'word' | 'number' | 'string' | 'identifier' | 'symbol' | 'comment';
  text: string;
  from: number;
  to: number;
}
const wordStart = /[\p{L}\p{Nl}_]/u;
const wordRest = /[\p{L}\p{Nl}\p{Mn}\p{Mc}\p{Nd}\p{Pc}\p{Cf}]/u;

/** A lossless lexer: whitespace is represented by source gaps, everything else by exact tokens. */
export function lex(source: string, locale: Locale = 'dot', cloud = false): Token[] {
  const result: Token[] = [];
  let i = 0;
  const fail = (message: string, at = i): never => {
    throw new SyntaxFailure(message, at, Math.min(source.length, at + 1));
  };
  function quoted(quote: string, start: number): void {
    i++;
    while (i < source.length) {
      if (source[i] === quote) {
        if (source[i + 1] === quote) {
          i += 2;
          continue;
        }
        i++;
        return;
      }
      i++;
    }
    fail(
      `Unclosed ${quote === '"' ? 'text string' : cloud ? 'text string' : 'quoted identifier'}.`,
      start,
    );
  }
  function interpolated(start: number): void {
    i += 2;
    while (i < source.length) {
      if (source[i] === '"') {
        if (source[i + 1] === '"') {
          i += 2;
          continue;
        }
        i++;
        return;
      }
      if (source.slice(i, i + 2) === '{{' || source.slice(i, i + 2) === '}}') {
        i += 2;
        continue;
      }
      if (source[i] === '}') fail('Escape a literal closing brace as }} in interpolated text.');
      if (source[i] === '{') {
        const end = findInterpolationEnd(source, i + 1, false);
        // The nested expression is validated by the parser separately.
        i = end + 1;
      } else i++;
    }
    fail('Unclosed interpolated text string.', start);
  }
  while (i < source.length) {
    if (/\s/u.test(source[i])) {
      i++;
      continue;
    }
    const from = i;
    let kind: Token['kind'] = 'symbol';
    const c = source[i];
    if (source.slice(i, i + 2) === '//' && !cloud) {
      kind = 'comment';
      while (i < source.length && source[i] !== '\n' && source[i] !== '\r') i++;
    } else if (source.slice(i, i + 2) === '/*' && !cloud) {
      kind = 'comment';
      const end = source.indexOf('*/', i + 2);
      if (end < 0) fail('Unclosed block comment.', from);
      i = end + 2;
    } else if (source.slice(i, i + 2) === '$"' && !cloud) {
      kind = 'string';
      interpolated(from);
    } else if ((c === '"' && !cloud) || c === "'") {
      kind = c === "'" && !cloud ? 'identifier' : 'string';
      quoted(c, from);
    } else if (
      /[0-9]/.test(c) ||
      (c === (locale === 'comma' && !cloud ? ',' : '.') && /[0-9]/.test(source[i + 1] ?? ''))
    ) {
      kind = 'number';
      const decimal = locale === 'comma' && !cloud ? ',' : '.';
      while (/[0-9]/.test(source[i] ?? '')) i++;
      if (source[i] === decimal) {
        i++;
        while (/[0-9]/.test(source[i] ?? '')) i++;
      }
      if (/[eE]/.test(source[i] ?? '')) {
        i++;
        if (/[+-]/.test(source[i] ?? '')) i++;
        const exponent = i;
        while (/[0-9]/.test(source[i] ?? '')) i++;
        if (i === exponent) fail('Expected digits after the exponent.', from);
      }
    } else if (wordStart.test(c)) {
      kind = 'word';
      i++;
      while (i < source.length && wordRest.test(source[i])) i++;
    } else {
      const pair = source.slice(i, i + 2);
      if (
        ['<=', '>=', '<>', '&&', '||', ':='].includes(pair) ||
        (pair === ';;' && locale === 'comma' && !cloud)
      )
        i += 2;
      else if ('(){}[],:;.+-*/^&=<>!%@?'.includes(c)) i++;
      else fail(`Unexpected character ${JSON.stringify(c)}.`);
    }
    result.push({ kind, text: source.slice(from, i), from, to: i });
  }
  return result;
}

/** Locate a template's matching brace without mistaking quoted braces for delimiters. */
export function findInterpolationEnd(source: string, start: number, cloud: boolean): number {
  let depth = 1;
  for (let i = start; i < source.length; i++) {
    const c = source[i];
    if (c === "'" || (c === '"' && !cloud)) {
      const quote = c;
      let closed = false;
      for (i++; i < source.length; i++) {
        if (source[i] === quote) {
          if (source[i + 1] === quote) i++;
          else {
            closed = true;
            break;
          }
        }
      }
      if (!closed)
        throw new SyntaxFailure('Unclosed string inside interpolation.', start, source.length);
    } else if (!cloud && source.slice(i, i + 2) === '//') {
      while (i < source.length && !/[\r\n]/.test(source[i])) i++;
    } else if (!cloud && source.slice(i, i + 2) === '/*') {
      const end = source.indexOf('*/', i + 2);
      if (end < 0)
        throw new SyntaxFailure('Unclosed comment inside interpolation.', i, source.length);
      i = end + 1;
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new SyntaxFailure('Unclosed interpolation; expected }.', start - 1, source.length);
}
