import { format } from './core/format';
import type { FormatOptions } from './core/types';

self.onmessage = (event: MessageEvent<{ id: number; source: string; options: FormatOptions }>) => {
  const { id, source, options } = event.data;
  self.postMessage({ id, result: format(source, options) });
};
