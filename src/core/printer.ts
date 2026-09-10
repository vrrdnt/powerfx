import type { Token } from './lexer';
import type { FormatOptions } from './types';

type Doc = string | { type: 'line'; soft?: boolean; hard?: boolean } | { type: 'indent' | 'group'; content: Doc[]; force?: boolean };
const line: Doc = { type: 'line' }, soft: Doc = { type: 'line', soft: true }, hard: Doc = { type: 'line', hard: true };
const group = (content: Doc[], force = false): Doc => ({ type: 'group', content, force });
const indent = (content: Doc[]): Doc => ({ type: 'indent', content });
interface Item { token?: Token; open?: Token; close?: Token; children?: Item[] }

export function print(tokens: Token[], source: string, options: FormatOptions, cloud = false): string {
  let index = 0;
  const list = options.locale === 'comma' && !cloud ? ';' : ',';
  const chain = options.locale === 'comma' && !cloud ? ';;' : ';';
  function tree(end?: string): Item[] {
    const items: Item[] = [];
    while (index < tokens.length) {
      const t = tokens[index++];
      if (t.text === end) break;
      const closer = ({ '(': ')', '{': '}', '[': ']' } as Record<string, string>)[t.text];
      if (closer && t.kind === 'symbol') {
        const children = tree(closer); items.push({ open: t, close: tokens[index - 1], children });
      } else items.push({ token: t });
    }
    return items;
  }
  const first = (i: Item): Token => (i.token ?? i.open)!;
  const last = (i: Item): Token => (i.token ?? i.close)!;
  function needsSpace(prev: Item, next: Item): boolean {
    const a = last(prev), b = first(next);
    if (a.kind === 'comment' || b.kind === 'comment') return true;
    if (['.', '?', '@'].includes(a.text) || ['.', '?', '%', ',', ';', ';;', ':', ')', ']', '}'].includes(b.text)) return false;
    if (b.text === '(' && ['word', 'identifier'].includes(a.kind)) return false;
    if (b.text === '[' && (cloud || next.children?.[0]?.token?.text === '@')) return false;
    return true;
  }
  function docs(items: Item[], parent = ''): Doc[] {
    const result: Doc[] = [];
    let separated = true;
    for (let k = 0; k < items.length; k++) {
      const item = items[k], t = first(item), prev = items[k - 1];
      if (prev && !separated) {
        const gap = source.slice(last(prev).to, t.from);
        if (options.preserveBlankLines && /\r?\n[\t ]*\r?\n/.test(gap)) result.push(hard, hard);
        else if (needsSpace(prev, item)) result.push(' ');
      }
      else if (prev && options.preserveBlankLines && /\r?\n[\t ]*\r?\n/.test(source.slice(last(prev).to, t.from))) result.push(hard);
      separated = false;
      if (item.children) {
        const open = item.open!.text, close = item.close!.text;
        if (!item.children.length) { result.push(open + close); continue; }
        const isLookup = open === '[' && (cloud && !!prev || item.children[0].token?.text === '@');
        const call = open === '(' && !!prev && ['word', 'identifier'].includes(last(prev).kind);
        const record = open === '{';
        const expanded = options.preset === 'expanded' || options.preset === 'custom' && (record ? options.recordLayout : options.argumentLayout) === 'expanded';
        const semanticCall = options.preset === 'adaptive' && call && ['If', 'Switch', 'With', 'Patch', 'ForAll', 'Concurrent'].includes(last(prev).text) && item.children.some(child => child.children);
        const forced = !isLookup && (semanticCall || expanded && (call || record || open === '['));
        const boundary = record ? line : soft;
        const content = docs(item.children, open);
        result.push(group([open, indent([boundary, ...content]), boundary, close], forced));
      } else if (t.kind === 'comment') {
        result.push(t.text);
        if (t.text.startsWith('//')) { result.push(hard); separated = true; }
      } else if (t.text === list) {
        result.push(t.text);
        if (items[k + 1]?.token?.kind === 'comment' && !/[\r\n]/.test(source.slice(t.to, first(items[k + 1]).from))) result.push(' ');
        else result.push(line);
        separated = true;
      } else if (!cloud && (t.text === chain || parent === '' && t.text === ';')) {
        result.push(t.text);
        if (k < items.length - 1) result.push(hard);
        separated = true;
      } else result.push(t.text);
    }
    return result;
  }
  return render([group(docs(tree()))], options).trim();
}

function render(docs: Doc[], options: FormatOptions): string {
  type Command = { doc: Doc; level: number; flat: boolean };
  const stack: Command[] = docs.slice().reverse().map(doc => ({ doc, level: 0, flat: false }));
  let output = '', column = 0;
  const unit = options.useTabs ? '\t' : ' '.repeat(options.indentSize);
  const width = options.printWidth;
  function fits(content: Doc[], remaining: number): boolean {
    const pending = [...content].reverse();
    while (pending.length && remaining >= 0) {
      const d = pending.pop()!;
      if (typeof d === 'string') { if (/[\r\n]/.test(d)) return false; remaining -= d.length; }
      else if (d.type === 'line') { if (d.hard) return false; if (!d.soft) remaining--; }
      else { if (d.force) return false; for (let i = d.content.length - 1; i >= 0; i--) pending.push(d.content[i]); }
    }
    return remaining >= 0;
  }
  while (stack.length) {
    const { doc, level, flat } = stack.pop()!;
    if (typeof doc === 'string') { output += doc; column = doc.includes('\n') ? doc.length - doc.lastIndexOf('\n') - 1 : column + doc.length; }
    else if (doc.type === 'line') {
      if (flat && !doc.hard) { if (!doc.soft) { output += ' '; column++; } }
      else { output = output.replace(/[\t ]+$/, ''); output += '\n' + unit.repeat(level); column = level * options.indentSize; }
    } else {
      const nextFlat = doc.type === 'group' ? !doc.force && fits(doc.content, width - column) : flat;
      for (let i = doc.content.length - 1; i >= 0; i--) stack.push({ doc: doc.content[i], level: level + (doc.type === 'indent' ? 1 : 0), flat: nextFlat });
    }
  }
  return output;
}
