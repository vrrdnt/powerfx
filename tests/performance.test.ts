import { expect, it } from 'vitest';
import { format } from '../src/core/format';
import { examples } from '../src/examples';
it('formats every bundled example in all presets', () => {
  for (const example of examples)
    for (const preset of ['adaptive', 'expanded', 'compact', 'custom'] as const) {
      const result = format(example.source, { mode: example.mode, preset });
      expect(result.diagnostics, example.name).toEqual([]);
      expect(format(result.text, { mode: example.mode, preset }).text).toBe(result.text);
    }
});
it('records warm formatting times for 10 KB and 100 KB documents', () => {
  for (const size of [10_000, 100_000]) {
    const source = 'Patch(Orders,Defaults(Orders),{Title:"Invoice",Amount:125.50});\n'.repeat(
      Math.ceil(size / 62),
    );
    format(source);
    const samples: number[] = [];
    for (let n = 0; n < 5; n++) {
      const result = format(source);
      expect(result.diagnostics).toEqual([]);
      samples.push(result.durationMs);
    }
    samples.sort((a, b) => a - b);
    console.log(
      `${source.length} characters: median ${samples[2].toFixed(1)} ms, max ${samples[4].toFixed(1)} ms`,
    );
    expect(samples[2]).toBeLessThan(size === 10_000 ? 100 : 1000);
  }
});
