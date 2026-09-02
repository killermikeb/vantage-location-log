# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vantage Location Log is a mobile-first, offline-capable PWA for recording and graphing locations discovered while playing the Vantage board game. It's plain static HTML/CSS/JS with no build step, no framework, and one vendored dependency (`d3.v7.min.js`). `vantage-graph.html` is the original standalone graph-viewer tool (with d3 inlined) that predates the PWA; `app.js`'s graph renderer is a direct port of its logic, kept in sync by hand so both stay compatible with the same data format.

## Commands

No package manager, build step, linter, or test suite — this is served as static files.

```bash
python3 -m http.server 8934 --directory /media/sf_CLAUDE/Vantage
```

This is also configured as the `vantage-pwa` launch target in [.claude/launch.json](.claude/launch.json) for the Browser preview tool. Open `http://localhost:8934/index.html`.

Deploy is via GitHub Pages (github.com/killermikeb/vantage-location-log) — no build step, so whatever lands on `gh-pages` is what's live. Two workflows manage that branch, both using `peaceiris/actions-gh-pages` / `rossjrw/pr-preview-action` with `keep_files: true` so neither wipes the other's output:
- [.github/workflows/deploy-production.yml](.github/workflows/deploy-production.yml): on push to `main`, publishes the repo root to the root of `gh-pages` — that's the live site.
- [.github/workflows/deploy-preview.yml](.github/workflows/deploy-preview.yml): on PR open/sync/reopen, publishes that branch to `gh-pages` under `pr-preview/pr-<number>/` and comments the preview link on the PR; removes it on close.

This requires the repo's Settings → Pages source to be "Deploy from a branch" → `gh-pages` → `/ (root)` (not the "GitHub Actions" build type — that mode replaces the whole site on every deploy and can't host the two side by side). `.nojekyll` at the repo root disables Jekyll processing, which is required here: `vantage-graph.html` contains a `{{ $json.data }}` template placeholder that Jekyll's Liquid engine would otherwise try to interpret.

## Conventions & Patterns

- **No framework, no build step**: plain HTML/CSS/JS only. Keep it that way — don't introduce a bundler, transpiler, or UI framework.
- **Mobile-first**: this is used one-handed during board-game play; desktop layout is not a design goal. Prioritize touch targets, one-screen-at-a-time tabs, and thumb reach over desktop ergonomics.
- **Data format**: the single source of truth is currently a plain-text blob stored in `localStorage` under `vantage_location_text` (there is no backup/sync file yet — see below), using this line syntax, one location per line, grouped under `// <ordinal day> <Mon> <year>` date-header comments (e.g. `// 15th Feb 2026`):
  ```
  <id> N:<target|---|***> E:<target|---|***> S:<target|---|***> W:<target|---|***> T:<type> [A:<label>-><target>,...] [B:<label>-><description>,...]
  ```
  - `---` = confirmed wall (no exit), `***` = unexplored/unknown.
  - `A:` (actions) creates a graph edge to another location `id` — comma-separated `label->target` pairs.
  - `B:` (bonuses) is informational only (item/lesson/outcome text), never a location reference, and is not drawn on the graph.
  - `T:` is a free-form location type; new values are picked up automatically into autocomplete (see `DEFAULT_TYPES` in [app.js](app.js)).
  - This format is deliberately compatible with `vantage-graph.html`'s `const input = \`...\`;` template so data can be copy-pasted between the two files directly.
- **Two parsers, kept manually in sync**: `parseAll()` in [app.js](app.js) (stats/autocomplete/dup-detection) and the inline `renderGraph()` port both re-implement the same line syntax independently. When changing the format, update both, plus `vantage-graph.html` if the standalone tool should keep matching.
- **File import quirk**: importing a `vantage-graph.html`-style file must use `lastIndexOf("const input = \`")`, not `indexOf`, because the file has a commented-out template line (`// const input = \`{{ $json.data }}\`;`) above the real one that also contains the marker text — see the comment at [app.js:356-359](app.js:356).
- **UI structure**: three tabs (Add / Graph / Data) toggled via `.view.active`, wired in `init()` in [app.js](app.js). Any new tab/view should follow this same pattern (a `#view-<name>` section, a tabbar button with `data-view`, and a branch in `switchView()`).
- **Styling**: no CSS framework; dark theme via CSS custom properties on `:root` in [index.html](index.html) (`--bg`, `--panel`, `--accent`, etc.). Reuse these tokens rather than hardcoding colors.
- **PWA/offline**: [sw.js](sw.js) cache-first serves everything in `ASSETS`. Any new static asset referenced by `index.html` must be added to that array and the `CACHE` version string bumped, or offline installs will keep serving stale files.
- **Data persistence is planned but not built**: `localStorage` is currently the only copy of a user's location data (the Data tab's Copy/Download/Import buttons are the manual workaround). There's a future intent to add a synced or saved backup file — if asked to build this, don't assume a specific mechanism (cloud sync API, file system access, git-committed file, etc.) without checking first, since none has been chosen yet.

## Known Pitfalls / Recurring Errors

_None recorded yet — this section should be updated as mistakes surface on this codebase._

## Docs Index

_No `docs/` directory yet._
