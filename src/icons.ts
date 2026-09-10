const paths: Record<string, string> = {
  copy: 'M9 9h11v11H9z M15 5V3H3v12h2',
  format: 'm8 4-5 8 5 8 M16 4l5 8-5 8 M14 6l-4 12',
  settings: 'M4 7h16M4 17h16 M8 4v6M16 14v6',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  close: 'm6 6 12 12M6 18 18 6',
  help: 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 3-5M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  file: 'M14 2H5v20h14V7z M14 2v5h5 M8 12h8M8 16h8',
};
paths.help = 'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0';
export const icon = (name: string) =>
  `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] ?? paths.file}"/></svg>`;
