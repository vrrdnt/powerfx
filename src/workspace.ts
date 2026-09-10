import { EditorState, Compartment, type Extension, type Text } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  keymap,
  rectangularSelection,
} from '@codemirror/view';
import { history, historyKeymap, defaultKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  foldService,
  indentUnit,
  StreamLanguage,
  syntaxHighlighting,
  HighlightStyle,
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { setDiagnostics } from '@codemirror/lint';
import { MergeView } from '@codemirror/merge';
import { lex, type Token } from './core/lexer';
import type { Diagnostic } from './core/types';
import type { Settings } from './settings';

const colorTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--editor)', color: 'var(--text)', fontSize: '14px', height: '100%' },
  '.cm-scroller': { fontFamily: 'var(--mono)', lineHeight: '1.85', overflow: 'auto' },
  '.cm-content': { padding: '18px 0', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0 20px 0 12px' },
  '.cm-gutters': {
    backgroundColor: 'var(--editor)',
    color: 'var(--gutter)',
    border: 'none',
    paddingLeft: '8px',
  },
  '.cm-lineNumbers .cm-gutterElement': { minWidth: '36px' },
  '.cm-activeLine,.cm-activeLineGutter': { backgroundColor: 'var(--active-line)' },
  '.cm-selectionBackground,&.cm-focused .cm-selectionBackground,::selection': {
    backgroundColor: 'var(--selection)',
  },
  '.cm-cursor,.cm-dropCursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-foldPlaceholder': {
    background: 'var(--surface)',
    borderColor: 'var(--border)',
    color: 'var(--muted)',
  },
  '.cm-panels': { background: 'var(--surface)', color: 'var(--text)' },
  '.cm-textfield': {
    background: 'var(--editor)',
    color: 'var(--text)',
    borderColor: 'var(--border)',
  },
  '.cm-button': { background: 'var(--raised)', color: 'var(--text)', borderColor: 'var(--border)' },
  '.cm-tooltip': {
    background: 'var(--surface)',
    color: 'var(--text)',
    borderColor: 'var(--border)',
  },
  '.cm-matchingBracket': {
    background: 'var(--selection)',
    outline: '1px solid var(--border-strong)',
  },
  '.cm-changedLine': { backgroundColor: 'var(--diff-line)' },
  '.cm-changedText': { backgroundColor: 'var(--diff-text)' },
});
const highlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: 'var(--syntax-keyword)' },
    { tag: tags.function(tags.variableName), color: 'var(--syntax-function)' },
    { tag: tags.string, color: 'var(--syntax-string)' },
    { tag: tags.number, color: 'var(--syntax-number)' },
    { tag: tags.comment, color: 'var(--syntax-comment)', fontStyle: 'italic' },
    { tag: tags.operator, color: 'var(--syntax-operator)' },
    { tag: tags.propertyName, color: 'var(--syntax-property)' },
  ]),
);
function language(settings: Settings): Extension {
  return StreamLanguage.define<{ block: boolean; quote: string | null }>({
    startState: () => ({ block: false, quote: null }),
    token(stream, state) {
      if (state.block) {
        if (stream.skipTo('*/')) {
          stream.match('*/');
          state.block = false;
        } else stream.skipToEnd();
        return 'comment';
      }
      if (state.quote) {
        while (!stream.eol()) {
          const c = stream.next();
          if (c === state.quote) {
            if (stream.peek() === state.quote) stream.next();
            else {
              state.quote = null;
              break;
            }
          }
        }
        return 'string';
      }
      if (stream.eatSpace()) return null;
      if (stream.match('//') || (settings.mode === 'yaml' && stream.match('#'))) {
        stream.skipToEnd();
        return 'comment';
      }
      if (stream.match('/*')) {
        state.block = true;
        return 'comment';
      }
      if (stream.match('$"')) {
        state.quote = '"';
        return 'string';
      }
      if (stream.match(/['"]/)) {
        state.quote = stream.current();
        return 'string';
      }
      if (stream.match(/\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/)) return 'number';
      if (stream.match(/[\p{L}_][\p{L}\p{N}_]*/u)) {
        if (
          /^(true|false|null|And|Or|Not|As|in|exactin|Self|Parent|ThisItem|ThisRecord)$/.test(
            stream.current(),
          )
        )
          return 'keyword';
        if (stream.match(/^\s*\(/, false)) return 'function(variableName)';
        if (stream.match(/^\s*:/, false)) return 'propertyName';
        return 'variableName';
      }
      if (stream.match(/[+*\/=<>!&|^%-]+/)) return 'operator';
      stream.next();
      return null;
    },
  });
}
const foldCache = new WeakMap<Text, Map<number, { from: number; to: number }>>();
function folding(settings: Settings): Extension {
  return foldService.of((state, from, to) => {
    if (settings.mode === 'yaml') {
      const line = state.doc.lineAt(from),
        base = line.text.match(/^ */)![0].length;
      let end = line.to;
      for (let n = line.number + 1; n <= state.doc.lines; n++) {
        const next = state.doc.line(n);
        if (next.text.trim() && next.text.match(/^ */)![0].length <= base) break;
        end = next.to;
      }
      return end > to ? { from: to, to: end } : null;
    }
    let ranges = foldCache.get(state.doc);
    if (!ranges) {
      ranges = new Map();
      const stack: Token[] = [];
      try {
        for (const token of lex(state.doc.toString(), settings.locale, settings.mode === 'cloud')) {
          if (token.kind !== 'symbol') continue;
          if (['(', '{', '['].includes(token.text)) stack.push(token);
          else if ([')', '}', ']'].includes(token.text)) {
            const opening = stack.pop();
            if (!opening) continue;
            const startLine = state.doc.lineAt(opening.from);
            if (startLine.number < state.doc.lineAt(token.from).number)
              ranges.set(startLine.from, { from: opening.to, to: token.from });
          }
        }
      } catch {
        /* Incomplete input remains editable. */
      }
      foldCache.set(state.doc, ranges);
    }
    return ranges.get(from) ?? null;
  });
}
export function createWorkspace(
  parent: HTMLElement,
  source: string,
  settings: Settings,
  onChange: () => void,
  onFormat: () => void,
) {
  const aConfig = new Compartment(),
    bConfig = new Compartment();
  const common: Extension[] = [
    lineNumbers(),
    highlightActiveLineGutter(),
    drawSelection(),
    bracketMatching(),
    foldGutter(),
    rectangularSelection(),
    highlightSelectionMatches(),
    colorTheme,
    highlight,
    keymap.of([
      ...defaultKeymap,
      ...searchKeymap,
      ...foldKeymap,
      indentWithTab,
      {
        key: 'Mod-Enter',
        run: () => {
          onFormat();
          return true;
        },
      },
    ]),
  ];
  const dynamic = (s: Settings): Extension[] => [
    language(s),
    folding(s),
    indentUnit.of(s.useTabs ? '\t' : ' '.repeat(s.indentSize)),
    EditorState.tabSize.of(s.indentSize),
    s.wordWrap ? EditorView.lineWrapping : [],
  ];
  const merge = new MergeView({
    parent,
    a: {
      doc: source,
      extensions: [
        ...common,
        history(),
        keymap.of(historyKeymap),
        highlightActiveLine(),
        aConfig.of(dynamic(settings)),
        EditorView.contentAttributes.of({
          'aria-label': 'Source code',
          spellcheck: 'false',
          autocorrect: 'off',
          autocapitalize: 'off',
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange();
        }),
      ],
    },
    b: {
      doc: '',
      extensions: [
        ...common,
        bConfig.of(dynamic(settings)),
        EditorState.readOnly.of(true),
        EditorView.contentAttributes.of({ 'aria-label': 'Formatted code', spellcheck: 'false' }),
      ],
    },
    highlightChanges: false,
    gutter: false,
  });
  return {
    source: merge.a,
    output: merge.b,
    configure(s: Settings) {
      merge.a.dispatch({ effects: aConfig.reconfigure(dynamic(s)) });
      merge.b.dispatch({ effects: bConfig.reconfigure(dynamic(s)) });
    },
    diff(enabled: boolean) {
      merge.reconfigure({ highlightChanges: enabled, gutter: enabled });
    },
    diagnostics(items: Diagnostic[]) {
      const size = merge.a.state.doc.length;
      merge.a.dispatch(
        setDiagnostics(
          merge.a.state,
          items.map((d) => ({ ...d, from: Math.min(d.from, size), to: Math.min(d.to, size) })),
        ),
      );
    },
  };
}
