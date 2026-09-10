import { findInterpolationEnd, lex, type Token } from './lexer';
import { SyntaxFailure, type Locale } from './types';

/** Syntax-only validation: app bindings and function availability belong to the host. */
export function validate(tokens: Token[], source: string, locale: Locale, cloud = false): void {
  const ts = tokens.filter((t) => t.kind !== 'comment');
  let pos = 0,
    nesting = 0;
  const list = locale === 'comma' && !cloud ? ';' : ',';
  const chain = locale === 'comma' && !cloud ? ';;' : ';';
  const current = () => ts[pos];
  const at = (s: string) => current()?.text === s;
  const error = (message: string): never => {
    throw new SyntaxFailure(
      message,
      current()?.from ?? source.length,
      current()?.to ?? source.length,
    );
  };
  const eat = (s: string) => {
    if (at(s)) {
      pos++;
      return true;
    }
    return false;
  };
  const need = (s: string) => {
    if (!eat(s)) error(`Expected ${s}.`);
  };
  const name = () => {
    if (!current() || !['word', 'identifier'].includes(current().kind))
      error('Expected an identifier.');
    pos++;
  };
  const precedence: Record<string, number> = {
    Or: 1,
    '||': 1,
    And: 2,
    '&&': 2,
    '=': 3,
    '<>': 3,
    '<': 3,
    '>': 3,
    '<=': 3,
    '>=': 3,
    in: 3,
    exactin: 3,
    '&': 4,
    '+': 5,
    '-': 5,
    '*': 6,
    '/': 6,
    '^': 7,
    As: 0,
  };
  function expression(min = 0): void {
    if (++nesting > 200) error('This formula is nested too deeply (maximum 200 levels).');
    const token = current();
    if (!token) error('Expected an expression.');
    if ((!cloud && ['-', '+', '!', 'Not'].includes(token.text)) || (cloud && token.text === '-')) {
      pos++;
      expression(7);
    } else if (eat('(')) {
      sequence();
      need(')');
    } else if (!cloud && eat('{')) {
      if (!eat('}')) {
        do {
          name();
          need(':');
          expression();
        } while (eat(list));
        need('}');
      }
    } else if (!cloud && eat('[')) {
      if (eat('@')) {
        name();
        need(']');
      } else if (!eat(']')) {
        do {
          expression();
        } while (eat(list));
        need(']');
      }
    } else if (['word', 'identifier', 'string', 'number'].includes(token.kind)) {
      pos++;
      if (token.text.startsWith('$"')) validatePowerTemplate(token, locale);
    } else error('Expected an expression.');
    while (current()) {
      if (eat('(')) {
        if (!eat(')')) {
          do {
            cloud ? expression() : sequence();
          } while (eat(list));
          need(')');
        }
      } else if (eat('.')) {
        name();
      } else if (cloud && eat('?')) {
        if (!at('[') && !at('.')) error('Expected a property lookup after ?.');
      } else if (eat('[')) {
        if (cloud) expression();
        else {
          need('@');
          name();
        }
        need(']');
      } else if (!cloud && eat('%')) {
        /* postfix percentage */
      } else {
        const op = current().text;
        const prec = cloud ? undefined : precedence[op];
        if (prec === undefined || prec < min) break;
        pos++;
        if (op === 'As') name();
        else expression(prec + (op === '^' ? 0 : 1));
      }
    }
    nesting--;
  }
  function sequence(): void {
    expression();
    while (!cloud && eat(chain)) {
      if (!current() || [')', '}', list].includes(current().text)) break;
      expression();
    }
  }
  function type(): void {
    if (eat('[')) {
      type();
      need(']');
    } else if (eat('{')) {
      if (!eat('}')) {
        do {
          name();
          need(':');
          type();
        } while (eat(list));
        need('}');
      }
    } else name();
  }
  function isFunctionDefinition(): boolean {
    if (!ts[pos + 1] || ts[pos + 1].text !== '(') return false;
    let depth = 0;
    for (let j = pos + 1; j < ts.length; j++) {
      if (ts[j].text === '(') depth++;
      if (ts[j].text === ')' && --depth === 0) return ts[j + 1]?.text === ':';
    }
    return false;
  }
  function definition(): void {
    name();
    if (eat('(')) {
      if (!eat(')')) {
        do {
          name();
          need(':');
          type();
        } while (eat(list));
        need(')');
      }
      need(':');
      type();
      need('=');
      if (eat('{')) {
        if (!at('}')) sequence();
        need('}');
      } else expression();
    } else {
      if (!eat(':=')) need('=');
      expression();
    }
    need(';');
  }
  if (!ts.length) return;
  // A final semicolon distinguishes a named-formula document from an equality expression.
  const definitions =
    !cloud &&
    (isFunctionDefinition() ||
      ts[1]?.text === ':=' ||
      (ts[1]?.text === '=' && ts.at(-1)?.text === ';'));
  if (definitions) {
    while (current()) definition();
  } else sequence();
  if (current()) error(`Unexpected ${JSON.stringify(current().text)} after the expression.`);
}

function validatePowerTemplate(token: Token, locale: Locale): void {
  const text = token.text;
  for (let i = 2; i < text.length - 1; i++) {
    if (text.slice(i, i + 2) === '{{' || text.slice(i, i + 2) === '}}') {
      i++;
      continue;
    }
    if (text[i] !== '{') continue;
    const end = findInterpolationEnd(text, i + 1, false);
    const expression = text.slice(i + 1, end);
    try {
      if (!expression.trim())
        throw new SyntaxFailure(
          'Expected an expression inside interpolation.',
          0,
          expression.length,
        );
      validate(lex(expression, locale), expression, locale);
    } catch (e) {
      if (e instanceof SyntaxFailure)
        throw new SyntaxFailure(e.message, token.from + i + 1 + e.from, token.from + i + 1 + e.to);
      throw e;
    }
    i = end;
  }
}
