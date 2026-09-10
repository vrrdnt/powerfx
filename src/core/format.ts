import { lex } from './lexer';
import { validate } from './parser';
import { print } from './printer';
import { defaults, SyntaxFailure, type FormatOptions, type FormatResult } from './types';
import { formatTemplate } from './templates';
import { formatYaml } from './yaml';

export function formatFormula(source: string, options: FormatOptions, cloud = false): string {
  const tokens = lex(source, options.locale, cloud);
  validate(tokens, source, options.locale, cloud);
  const result = print(tokens, source, options, cloud);
  const outputTokens = lex(result, options.locale, cloud);
  if (
    tokens.length !== outputTokens.length ||
    tokens.some(
      (token, i) => token.kind !== outputTokens[i].kind || token.text !== outputTokens[i].text,
    )
  ) {
    throw new SyntaxFailure(
      'Formatting could not preserve every token. The original has been kept.',
      0,
      source.length,
    );
  }
  validate(outputTokens, result, options.locale, cloud);
  return result;
}
export function format(source: string, config: Partial<FormatOptions> = {}): FormatResult {
  const start = performance.now();
  const options = { ...defaults, ...config };
  try {
    if (source.length > 2_000_000)
      throw new SyntaxFailure(
        'This document exceeds the 2 MB text limit. Split it into smaller files.',
        0,
        0,
      );
    const result =
      options.mode === 'yaml'
        ? formatYaml(source, options)
        : {
            text:
              options.mode === 'cloud' || options.mode === 'desktop'
                ? formatTemplate(source, options, options.mode === 'cloud')
                : formatFormula(source, options),
            outline: [],
          };
    return { ...result, diagnostics: [], durationMs: performance.now() - start };
  } catch (error) {
    const known = error instanceof SyntaxFailure;
    return {
      text: source,
      diagnostics: [
        {
          from: known ? error.from : 0,
          to: known ? error.to : 0,
          message: known
            ? error.message
            : 'Unable to format this document. The original has been kept.',
          severity: 'error',
        },
      ],
      durationMs: performance.now() - start,
      outline: [],
    };
  }
}
