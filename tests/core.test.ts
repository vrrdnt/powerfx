import { describe, expect, it } from 'vitest';
import { format } from '../src/core/format';
import { lex } from '../src/core/lexer';
import { defaults, type FormatOptions } from '../src/core/types';

const formulas = [
  'With({total:Sum(cart,price*quantity)},If(total>100,Notify("Discount applied",NotificationType.Success),Notify("Standard pricing",NotificationType.Information)))',
  'Patch(Orders,Defaults(Orders),{Title:"New order",Amount:12.5,Lines:[{Sku:"A",Qty:2},{Sku:"B",Qty:1}]});Notify("Saved")',
  'Filter(Accounts As a,a.Name="Test" && a.Total>=10)',
  "LookUp('Order details','Display name' = \"A\").'Unit price'",
  'Table({日本語:"こんにちは",n:1e-3},{日本語:"世界",n:-2.5})',
  'Sum([1,2,3],Value)*50%',
  'If(!IsBlank(Self.Text),-Value(Self.Text),0)',
  'If(true,// keep this comment\n1,/* and this one */2)',
  '// header\nSet(x,1);\n\n// another action\nSet(y,x+1)',
  '"quotes "" and new\nline" & "// not a comment"',
  '[@Orders][@Title]',
  'Filter(Orders,Orders[@Id]=[@selectedId])',
  '$"Hello {If(true, "world", "everyone")} {{literal}}"',
  'Rate = 0.1; Total = Sum(Orders,Amount);',
  'Double(x: Number): Number = x * 2; Greet(name: Text): Text = "Hi " & name;',
  'Save(x: Number): Void = { Set(value,x); Notify("Saved"); };',
  'Person := Type({Name:Text,Age:Number});',
  'Empty = {}; Items = [];',
];
describe('Power Apps formatter', () => {
  for (const source of formulas) for (const preset of ['adaptive','expanded','compact','custom'] as const) {
    it(`${preset}: ${source.slice(0,70)}`, () => {
      const options: Partial<FormatOptions> = { preset, printWidth: 60 };
      const first = format(source, options);
      expect(first.diagnostics).toEqual([]);
      expect(lex(first.text).map(t => t.text)).toEqual(lex(source).map(t => t.text));
      const second = format(first.text, options);
      expect(second.diagnostics).toEqual([]);
      expect(second.text).toBe(first.text);
    });
  }
  it('formats comma-decimal locale without converting it', () => {
    const source = 'Set(x;1,25);;Patch(Orders;Defaults(Orders);{Amount:x;Title:"A"})';
    const result = format(source, { locale:'comma', preset:'expanded' });
    expect(result.diagnostics).toEqual([]);
    expect(result.text).toContain('1,25');
    expect(result.text).toContain(';;\n');
    expect(format(result.text, {locale:'comma',preset:'expanded'}).text).toBe(result.text);
  });
  it('keeps short calls compact and expands long calls', () => {
    expect(format('Sum(1,2)').text).toBe('Sum(1, 2)');
    expect(format('Sum(1,2)', {preset:'expanded'}).text).toBe('Sum(\n    1,\n    2\n)');
  });
  for (const source of ['If(a,)', 'Set(x,1', '"unclosed', 'a +', 'foo bar', '{A:}', 'x[Name]', '$"Hello {a +}"', '1e+', 'If(true,1,2))']) {
    it(`retains invalid source: ${source}`, () => {
      const result = format(source);
      expect(result.text).toBe(source);
      expect(result.diagnostics[0]?.severity).toBe('error');
    });
  }
  it('bounds nesting', () => expect(format('('.repeat(250)+'1'+')'.repeat(250)).diagnostics[0]?.message).toContain('deeply'));
  it('handles comments-only and empty documents', () => {
    expect(format('').text).toBe('');
    expect(format('// note\n/* two */').diagnostics).toEqual([]);
  });
  it('does not require app bindings', () => expect(format('Company.CustomFunction(UnknownDataSource, MissingVariable)').diagnostics).toEqual([]));
});
