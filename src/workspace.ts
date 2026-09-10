import { EditorView, lineNumbers, highlightActiveLine, drawSelection, keymap } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { bracketMatching, foldGutter, foldKeymap } from '@codemirror/language';

export { EditorView };
export const basicSetup = [lineNumbers(), highlightActiveLine(), drawSelection(), history(), bracketMatching(), foldGutter(), highlightSelectionMatches(), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, ...foldKeymap])];
