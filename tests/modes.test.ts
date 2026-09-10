import { describe, expect, it } from 'vitest';
import { parseDocument } from 'yaml';
import { format } from '../src/core/format';
import type { Mode } from '../src/core/types';

describe('Power Automate', () => {
  const cases: [Mode, string][] = [
    ['cloud', "if(greater(variables('total'),100),'High','Low')"],
    ['cloud', "@concat('Hello ',triggerBody()?['name'])"],
    ['cloud', "Hello @{coalesce(triggerBody()?['name'],'friend')}! Your total is @{add(1,2)}."],
    ['cloud', "if(equals(item()?['Status'],'Open'),concat('It''s ',string(1)),null)"],
    ['cloud', 'Literal @@{value}; actual @{add(1,2)}'],
    ['desktop', '=If(total>100,"High","Low")'],
    ['desktop', 'The total is ${Sum(10,20)} and the literal is $${do not format}.'],
    ['desktop', '=Index(Index(DataTableVar,1),2)'],
    ['desktop', 'A plain text desktop input.'],
  ];
  for (const [mode, source] of cases)
    for (const preset of ['adaptive', 'expanded', 'compact'] as const) {
      it(`${mode}/${preset}: ${source}`, () => {
        const result = format(source, { mode, preset });
        expect(result.diagnostics).toEqual([]);
        expect(format(result.text, { mode, preset }).text).toBe(result.text);
      });
    }
  it('preserves template literal spacing', () => {
    expect(format('  Hello @{add(1,2)}  ', { mode: 'cloud' }).text).toBe('  Hello @{add(1, 2)}  ');
  });
  it('reports offsets inside templates', () => {
    const result = format('Hi @{add(1,)}', { mode: 'cloud' });
    expect(result.diagnostics[0].from).toBeGreaterThan(5);
  });
  it('does not parse Power Apps as WDL', () =>
    expect(format('If(x > 1,"yes","no")', { mode: 'cloud' }).diagnostics.length).toBeGreaterThan(
      0,
    ));
});

describe('Power Apps YAML', () => {
  const sources = [
    '- Button1:\n    Control: Classic/Button@2.2.0\n    Properties:\n      Text: ="Hello"\n      OnSelect: =Set(total,Sum(cart,price*quantity));Notify("Saved")\n',
    'Screens:\n  Screen1:\n    Properties:\n      Fill: =Color.White\n    Children:\n      - Label1:\n          Control: Label@2.5.1\n          Properties:\n            Text: |\n              =If(total>100,"High","Low")\n',
    '# keep header\nApp:\n  Properties:\n    Formulas: |-\n      =Rate = 0.1; Total = Sum(Orders,Amount);\n  Other: |\n    exact  text\n    next line\n',
    "- Label1:\n    Properties:\n      Text: '=If(true," + '"It\'\'s good","Bad")' + "'\n",
    '- Label1:\n    Properties:\n      Text: |-\n        ="literal: # keep"\n',
    '- Label1:\n    Properties:\n      Text: |- # preserve comment\n        =If(true,"A", "B")\n',
  ];
  for (const source of sources)
    it(`round trips ${source.slice(0, 80)}`, () => {
      const result = format(source, { mode: 'yaml', preset: 'expanded' });
      expect(result.diagnostics).toEqual([]);
      expect(result.outline.length).toBeGreaterThan(0);
      expect(parseDocument(result.text).errors).toEqual([]);
      const again = format(result.text, { mode: 'yaml', preset: 'expanded' });
      expect(again.diagnostics).toEqual([]);
      expect(again.text).toBe(result.text);
    });
  it('preserves non-formula text and property order', () => {
    const source =
      '# start\nApp:\n  Properties:\n    Text: ="hello"\n  Notes: |\n    exact   spaces\n    1: true\n  Number: 000001\n';
    const result = format(source, { mode: 'yaml' });
    expect(result.text).toBe(source);
  });
  it('keeps invalid documents intact', () => {
    const source = 'App:\n  Properties:\n    Text: =If(1,\n';
    expect(format(source, { mode: 'yaml' }).text).toBe(source);
    expect(format(source, { mode: 'yaml' }).diagnostics.length).toBeGreaterThan(0);
  });
});
