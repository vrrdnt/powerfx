import { format } from '../src/core/format';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';

const results = [];
for (const target of [10_000, 100_000, 500_000]) {
  const line = 'Patch(Orders,Defaults(Orders),{Title:"Invoice",Amount:125.50});\n';
  const source = line.repeat(Math.ceil(target / line.length));
  format(source);
  const samples = [];
  for (let i = 0; i < 7; i++) {
    const result = format(source);
    if (result.diagnostics.length) throw new Error(result.diagnostics[0].message);
    samples.push(result.durationMs);
  }
  samples.sort((a, b) => a - b);
  results.push({
    characters: source.length,
    medianMs: Number(samples[3].toFixed(2)),
    maxMs: Number(samples[6].toFixed(2)),
  });
}
const report = {
  runtime: process.version,
  platform: process.platform,
  cpu: cpus()[0]?.model,
  measuredAt: new Date().toISOString(),
  method:
    'One warm-up, seven runs, Adaptive preset. Worker computation only; editor rendering excluded.',
  results,
};
console.log(JSON.stringify(report, null, 2));
if (process.argv.includes('--save'))
  writeFileSync('docs/benchmark.json', JSON.stringify(report, null, 2) + '\n');
