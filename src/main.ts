import '@fontsource/jetbrains-mono/latin-400.css';
import '@fontsource/jetbrains-mono/latin-500.css';
import './style.css';
import { createWorkspace } from './workspace';
import { examples, modeNames } from './examples';
import { shell } from './shell';
import {
  clearSaved,
  initialSettings,
  readSettings,
  readSource,
  saveSettings,
  saveSource,
  type Settings,
} from './settings';
import type { FormatResult, Mode, Preset } from './core/types';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
let settings = readSettings();
let sample = true,
  diff = false,
  focused = false,
  mobileOutput = false,
  generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined,
  timeout: ReturnType<typeof setTimeout> | undefined;
let worker: Worker | undefined,
  lastResult: FormatResult | null = null,
  toastTimer: ReturnType<typeof setTimeout>;
$('#app').innerHTML = shell;
const saved = settings.rememberSource ? readSource() : null;
const initial = saved ?? examples.find((e) => e.mode === settings.mode)!.source;
sample = saved === null;
const workspace = createWorkspace(
  $('#editors'),
  initial,
  settings,
  () => changed(),
  () => run(),
);
const doc = () => workspace.source.state.doc.toString();
function notice(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 4000);
}
function setStatus(message: string, kind = '') {
  $('#status').textContent = message;
  $('#status').dataset.kind = kind;
}
function makeWorker() {
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const instance = worker;
  worker.onmessage = (event) => {
    if (instance !== worker || event.data.id !== generation) return;
    busy = false;
    clearTimeout(timeout);
    $('#cancel').hidden = true;
    accept(event.data.result);
  };
  worker.onerror = () => {
    if (instance !== worker) return;
    invalidate();
    setStatus('Worker stopped. Press Format to retry.', 'error');
    $('#ready-badge').textContent = 'ERROR';
    $('#cancel').hidden = true;
    worker?.terminate();
    worker = undefined;
  };
}
let busy = false;
function invalidate() {
  if (busy) {
    worker?.terminate();
    worker = undefined;
    busy = false;
  }
  generation++;
  lastResult = null;
  $('#copy').setAttribute('disabled', '');
  $('#download').setAttribute('disabled', '');
  $('#cancel').hidden = true;
  clearTimeout(timeout);
}
function changed() {
  sample = false;
  $('#source-badge').textContent = 'EDITING';
  invalidate();
  $('#ready-badge').textContent = 'OUTDATED';
  setStatus(settings.live ? 'Waiting for typing…' : 'Preview outdated. Press Format.');
  $('#empty-hint').hidden = doc().length > 0;
  updateStats();
  suggestMode();
  if (settings.rememberSource && !saveSource(doc()))
    notice('Code could not be saved. Browser storage may be full or disabled.');
  clearTimeout(timer);
  if (settings.live) timer = setTimeout(run, 250);
}
function run() {
  clearTimeout(timer);
  invalidate();
  const id = generation;
  setStatus('Formatting…');
  $('#ready-badge').textContent = 'WORKING';
  $('#cancel').hidden = false;
  if (!worker) makeWorker();
  busy = true;
  worker!.postMessage({ id, source: doc(), options: settings });
  timeout = setTimeout(() => {
    if (id !== generation) return;
    invalidate();
    $('#cancel').hidden = true;
    $('#ready-badge').textContent = 'TIMEOUT';
    setStatus('Formatting timed out. Try a smaller document.', 'error');
  }, 8000);
}
function accept(result: FormatResult) {
  lastResult = result;
  const bad = result.diagnostics.some((d) => d.severity === 'error');
  workspace.diagnostics(result.diagnostics);
  $('#diagnostics').replaceChildren();
  $('#diagnostics').hidden = !result.diagnostics.length;
  for (const diagnostic of result.diagnostics) {
    const button = document.createElement('button');
    button.textContent = `Line ${workspace.source.state.doc.lineAt(Math.min(diagnostic.from, doc().length)).number}: ${diagnostic.message}`;
    button.onclick = () => {
      workspace.source.dispatch({
        selection: { anchor: Math.min(diagnostic.from, doc().length) },
        scrollIntoView: true,
      });
      workspace.source.focus();
    };
    $('#diagnostics').append(button);
  }
  workspace.output.dispatch({
    changes: { from: 0, to: workspace.output.state.doc.length, insert: bad ? '' : result.text },
  });
  $('#copy').toggleAttribute('disabled', bad || !result.text);
  $('#download').toggleAttribute('disabled', bad || !result.text);
  $('#ready-badge').textContent = bad ? 'CHECK SOURCE' : !doc() ? 'EMPTY' : 'READY';
  $('#ready-badge').dataset.state = bad ? 'error' : 'ready';
  setStatus(
    bad
      ? 'Source kept. Resolve the syntax issue to format.'
      : !doc()
        ? 'Ready for your code.'
        : result.text === doc()
          ? 'Already looking good.'
          : 'Formatted locally. Ready to copy.',
    bad ? 'error' : 'success',
  );
  $('#timing').textContent = `${result.durationMs < 1 ? '<1' : result.durationMs.toFixed(0)} ms`;
  updateStats();
  renderOutline(result);
  $('#source-badge').textContent = sample ? 'EXAMPLE' : 'YOUR CODE';
}
function renderOutline(result: FormatResult) {
  $('#outline').hidden = settings.mode !== 'yaml' || !result.outline.length;
  $('#outline-items').replaceChildren();
  for (const entry of result.outline) {
    const button = document.createElement('button');
    button.textContent = entry.label;
    button.title = entry.label;
    button.onclick = () => {
      workspace.source.dispatch({
        selection: { anchor: entry.from, head: entry.to },
        scrollIntoView: true,
      });
      workspace.source.focus();
    };
    $('#outline-items').append(button);
  }
}
function updateStats() {
  $('#stats').textContent =
    `${workspace.source.state.doc.lines} lines · ${doc().length.toLocaleString()} chars`;
  $('#style-status').textContent =
    `${settings.useTabs ? 'Tabs' : settings.indentSize + ' spaces'} · ${settings.printWidth} cols`;
}
function applyTheme() {
  const dark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#090d09' : '#f4f7f0');
  $('#theme').setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}
function syncControls() {
  const values: Record<string, string> = {
    mode: settings.mode,
    preset: settings.preset,
    'indent-size': String(settings.indentSize),
    'print-width': String(settings.printWidth),
    'argument-layout': settings.argumentLayout,
    'record-layout': settings.recordLayout,
    locale: settings.locale,
    'theme-select': settings.theme,
  };
  for (const [id, value] of Object.entries(values)) $<HTMLInputElement>('#' + id).value = value;
  const checks: Record<string, boolean> = {
    tabs: settings.useTabs,
    'blank-lines': settings.preserveBlankLines,
    live: settings.live,
    wrap: settings.wordWrap,
    remember: settings.rememberSource,
  };
  for (const [id, checked] of Object.entries(checks))
    $<HTMLInputElement>('#' + id).checked = checked;
  $<HTMLSelectElement>('#locale').disabled = ['yaml', 'cloud'].includes(settings.mode);
  $('#locale-note').textContent =
    settings.mode === 'yaml'
      ? 'Power Apps YAML uses invariant decimal-dot formulas.'
      : settings.mode === 'cloud'
        ? 'Cloud expressions use their own language and comma argument separators.'
        : 'Use the convention your formula was written in. Formatting does not convert locales.';
  applyTheme();
}
function updateSettings() {
  syncControls();
  workspace.configure(settings);
  if (!saveSettings(settings))
    notice('Settings are active for this session; browser storage is unavailable.');
  if (settings.rememberSource) saveSource(doc());
  updateStats();
  run();
}
function changeMode(mode: Mode) {
  settings.mode = mode;
  $('#suggestion').hidden = true;
  updateSettings();
}
function suggestMode() {
  const text = doc().trim();
  let suggested: Mode | undefined;
  if (/(?:^|\n)\s*(?:Properties:|Control:\s|Screens:)/.test(text)) suggested = 'yaml';
  else if (text.startsWith('=') || text.includes('${')) suggested = 'desktop';
  else if (
    text.startsWith('@') ||
    /\b(?:variables|triggerBody|outputs|coalesce|equals)\s*\('/.test(text)
  )
    suggested = 'cloud';
  if (suggested && suggested !== settings.mode) {
    $('#suggestion').hidden = false;
    $('#suggestion span').textContent = `This looks like ${modeNames[suggested]}.`;
    const target = suggested;
    $('#suggestion button').textContent = `Switch to ${modeNames[target]}`;
    $('#suggestion button').onclick = () => changeMode(target);
  } else $('#suggestion').hidden = true;
}
function layout() {
  $('.tool').classList.toggle('focus-mode', focused);
  $('.tool').classList.toggle('show-output', mobileOutput);
  $('#source-tab').setAttribute('aria-pressed', String(!mobileOutput));
  $('#output-tab').setAttribute('aria-pressed', String(mobileOutput));
  workspace.source.requestMeasure();
  workspace.output.requestMeasure();
}

$('#format').onclick = run;
$('#cancel').onclick = () => {
  clearTimeout(timer);
  invalidate();
  $('#cancel').hidden = true;
  $('#ready-badge').textContent = 'CANCELLED';
  setStatus('Formatting cancelled. Source kept.');
};
$('#copy').onclick = async () => {
  if (!lastResult || lastResult.diagnostics.length) return;
  try {
    await navigator.clipboard.writeText(lastResult.text);
    notice('Formatted code copied.');
  } catch {
    notice('Clipboard access was blocked. Select the output and copy it manually.');
    workspace.output.dispatch({
      selection: { anchor: 0, head: workspace.output.state.doc.length },
    });
    workspace.output.focus();
  }
};
$('#download').onclick = () => {
  if (!lastResult || lastResult.diagnostics.length) return;
  const url = URL.createObjectURL(
    new Blob([lastResult.text], { type: 'text/plain;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download =
    settings.mode === 'yaml'
      ? 'formatted.pa.yaml'
      : settings.mode === 'cloud'
        ? 'formatted-expression.txt'
        : 'formatted.fx';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('#clear').onclick = () => {
  workspace.source.dispatch({ changes: { from: 0, to: doc().length, insert: '' } });
  workspace.source.focus();
};
$('#import').onclick = () => $<HTMLInputElement>('#file-input').click();
$<HTMLInputElement>('#file-input').onchange = async (event) => {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  if (!file) return;
  if (file.size > 2_000_000) {
    notice('Choose a text file smaller than 2 MB.');
    input.value = '';
    return;
  }
  try {
    const text = await file.text();
    if (text.includes('\0')) {
      notice('This appears to be a binary file. Import a formula or YAML file.');
      return;
    }
    if (/\.ya?ml$/i.test(file.name)) settings.mode = 'yaml';
    workspace.source.dispatch({ changes: { from: 0, to: doc().length, insert: text } });
    updateSettings();
    sample = false;
    $('#source-badge').textContent = 'IMPORTED';
    notice(`Imported ${file.name}`);
  } catch {
    notice('The file could not be read.');
  } finally {
    input.value = '';
  }
};
$('#diff').onclick = () => {
  diff = !diff;
  workspace.diff(diff);
  $('.tool').classList.toggle('diff-on', diff);
  $('#diff').setAttribute('aria-pressed', String(diff));
};
$('#focus').onclick = () => {
  focused = !focused;
  $('#focus').setAttribute('aria-pressed', String(focused));
  $('#focus').textContent = focused ? 'Split' : 'Focus';
  layout();
};
$('#source-tab').onclick = () => {
  mobileOutput = false;
  layout();
};
$('#output-tab').onclick = () => {
  mobileOutput = true;
  layout();
};
$('#theme').onclick = () => {
  settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  syncControls();
  saveSettings(settings);
};
for (const id of ['settings', 'examples', 'help'])
  $('#' + id).onclick = () => $<HTMLDialogElement>('#' + id + '-dialog').showModal();
$('#settings-done').onclick = () => $<HTMLDialogElement>('#settings-dialog').close();
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) =>
  dialog.addEventListener('click', (event) => {
    const r = dialog.getBoundingClientRect();
    if (
      event.target === dialog &&
      (event.clientX < r.left ||
        event.clientX > r.right ||
        event.clientY < r.top ||
        event.clientY > r.bottom)
    )
      dialog.close();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-example]').forEach(
  (button) =>
    (button.onclick = () => {
      const example = examples[Number(button.dataset.example)];
      settings.mode = example.mode;
      settings.locale = 'dot';
      workspace.source.dispatch({ changes: { from: 0, to: doc().length, insert: example.source } });
      sample = true;
      updateSettings();
      $<HTMLDialogElement>('#examples-dialog').close();
    }),
);
$<HTMLSelectElement>('#mode').onchange = (event) =>
  changeMode((event.target as HTMLSelectElement).value as Mode);
$<HTMLSelectElement>('#preset').onchange = (event) => {
  settings.preset = (event.target as HTMLSelectElement).value as Preset;
  updateSettings();
};
const controls: Record<string, keyof Settings> = {
  'indent-size': 'indentSize',
  'print-width': 'printWidth',
  tabs: 'useTabs',
  'blank-lines': 'preserveBlankLines',
  'argument-layout': 'argumentLayout',
  'record-layout': 'recordLayout',
  locale: 'locale',
  live: 'live',
  wrap: 'wordWrap',
  remember: 'rememberSource',
  'theme-select': 'theme',
};
for (const [id, key] of Object.entries(controls))
  $('#' + id).onchange = (event) => {
    const input = event.target as HTMLInputElement;
    let value: unknown = input.type === 'checkbox' ? input.checked : input.value;
    if (key === 'indentSize' || key === 'printWidth') value = Number(value);
    if (
      key === 'printWidth' &&
      (!Number.isInteger(value) || Number(value) < 40 || Number(value) > 240)
    ) {
      notice('Choose a line width between 40 and 240.');
      syncControls();
      return;
    }
    Object.assign(settings, { [key]: value });
    if (key === 'argumentLayout' || key === 'recordLayout') settings.preset = 'custom';
    updateSettings();
  };
$('#erase').onclick = () => {
  clearSaved();
  settings = { ...initialSettings };
  updateSettings();
  notice('Saved code erased. Settings reset. The editor is still open.');
};
$('.dismiss-suggestion').onclick = () => ($('#suggestion').hidden = true);
let ratio = 50;
function resize(value: number) {
  ratio = Math.max(25, Math.min(75, value));
  $('.tool').style.setProperty('--split', ratio + '%');
  $('#splitter').setAttribute('aria-valuenow', String(Math.round(ratio)));
  workspace.source.requestMeasure();
  workspace.output.requestMeasure();
}
$('#splitter').onpointerdown = (event) => {
  event.preventDefault();
  const element = event.currentTarget as HTMLElement;
  element.setPointerCapture(event.pointerId);
  element.onpointermove = (move) => {
    const rect = $('#editors').getBoundingClientRect();
    resize(((move.clientX - rect.left) / rect.width) * 100);
  };
  element.onpointerup = () => {
    element.onpointermove = null;
  };
};
$('#splitter').onkeydown = (event) => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    resize(ratio + (event.key === 'ArrowLeft' ? -5 : 5));
  }
};
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    run();
  }
});
syncControls();
makeWorker();
updateStats();
run();
