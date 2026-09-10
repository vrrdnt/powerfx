# Power Fx & Flow

A fast, private formatter for Power Apps, Power Automate, and Power Apps YAML.

**[Open the formatter](https://vrrdnt.dev/powerfx/)**

## Use it

Choose a language, paste code or import a text file, choose a layout, and copy the
formatted result. Formatting runs in a browser worker. The source stays editable
with undo; malformed input is retained and stale output cannot be copied.

- **Power Apps:** property formulas, actions, named formulas, user-defined
  functions and types. Both decimal-dot and decimal-comma conventions are supported.
- **Power Apps YAML:** current control code and `.pa.yaml` formula properties.
  A property navigator jumps to embedded formulas. Surrounding values, order,
  comments and literal text are preserved.
- **Power Automate Cloud:** Workflow Definition Language expressions, leading
  `@` expressions, and `@{…}` interpolation. This is not Power Fx.
- **Power Automate Desktop:** leading `=` Power Fx and `${…}` text interpolation,
  including escaped `$${` text.

Adaptive expands nested branching calls. Expanded puts arguments and record fields
on separate lines. Compact fits to the chosen line width. Custom independently
controls argument and record layouts. Line width is a target: strings, comments,
and indivisible expressions are never broken by changing their content.

The desktop workspace includes diff, focus mode, folding, find/replace, resizing,
dark/light/system themes, configurable indentation, and local file downloads.
`Ctrl/Cmd+Enter` formats; `Ctrl/Cmd+F` finds; `Ctrl/Cmd+Z` undoes. Press Escape then
Tab to leave the editor when Tab indentation is enabled.

## Privacy and compatibility

No accounts, analytics, AI calls, or formula uploads. Fonts and runtime assets are
served with the site. Settings are stored locally. Remembering code is off by
default and can be enabled or erased in Settings. Storage failures do not prevent
formatting. Other scripts on the same origin can access browser storage; avoid
remembering confidential code on a shared device.

The formatter validates syntax and checks that formatting preserves meaningful
tokens. It does not execute formulas, resolve your app's data sources, check types,
or establish whether a function is available in a particular Power Platform host.
It is an independent implementation, not Microsoft's authoring engine. Unsupported
or malformed syntax leaves the input unchanged with a diagnostic. Report examples
through GitHub Issues after removing private data.

Control YAML can be pasted into Power Apps Studio. External `.pa.yaml` editing is
supported through Power Platform Git integration; modifying source extracted from
an `.msapp` alone does not update an app. Legacy `.fx.yaml` source formats and
`.msapp` repackaging are outside this release. YAML formulas use invariant
decimal-dot syntax. Formatting does not convert locales or languages.

Text is limited to 2,000,000 characters (file imports to 2 MB), expressions to 200
levels of nesting, and worker jobs to eight seconds. Oversized input is retained.
Cancel terminates the worker; Format starts a fresh job.

## Develop

Use Node.js 24 and npm:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/powerfx/`.

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run bench
```

Browser tests run against the production build. Tests cover all modes, idempotence,
token preservation, YAML round trips, malformed input, clipboard/storage failure,
imports, downloads, settings, and worker cancellation. Benchmarks record warm core
formatting separately from editor rendering; see [measurements](docs/benchmark.json).

## Architecture

- `src/core` contains the standalone `format(source, options)` API. Its result
  includes text, ranged diagnostics, duration, and YAML property navigation.
- Power Fx and cloud expressions have distinct lexical/syntax rules. The printer
  operates on lossless tokens and structural groups. Strings and comments remain
  exact; Power Fx interpolated string bodies are validated and preserved as written.
- YAML uses the `yaml` package's source ranges for targeted formula edits, then
  reparses and compares the data model. It never serializes the entire document.
- `src/worker.ts` runs the formatter away from the editor. Request IDs suppress
  obsolete results. UI code has no access to a backend.
- CodeMirror 6 supplies editing, search, and diff. Vite produces static assets.

## Deploy

GitHub Pages uses the `Deploy` workflow after checks pass on `main`. Vite's base is
`/powerfx/`. The project repository has **no custom domain or CNAME file**: it
inherits `vrrdnt.dev` from the `vrrdnt.github.io` user site.

The existing Cloudflare Worker remains restricted to `/moni-planner*`; the
formatter is served by GitHub Pages. Cloudflare SSL/TLS should remain Full (strict).
No DNS or planner routing changes are required for formatter updates.

To roll back, revert the offending commit and push; the last successful deployment
remains available when checks fail. No data migrations are necessary.

## References

- [Microsoft Power Fx grammar](https://learn.microsoft.com/en-us/power-platform/power-fx/expression-grammar)
- [App.Formulas and definitions](https://learn.microsoft.com/en-us/power-platform/power-fx/reference/object-app)
- [Cloud-flow expressions](https://learn.microsoft.com/en-us/azure/logic-apps/expression-functions-reference)
- [Desktop Power Fx](https://learn.microsoft.com/en-us/power-automate/desktop-flows/power-fx)
- [Power Apps YAML](https://learn.microsoft.com/en-us/power-apps/maker/canvas-apps/power-apps-yaml)

MIT licensed. This project is independent of Microsoft.
