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
  - Both `A:` and `B:` labels are always `<Verb>/<sub-name>` (e.g. `Help/Repair`, `Move/Leap`), where `<Verb>` is one of `ACTION_VERBS` in [app.js](app.js) (`Move`, `Look`, `Engage`, `Help`, `Take`, `Overpower`) — these are the same six verbs `renderGraph()`'s edge-color switch keys off of (by label prefix), and `ACTION_VERB_COLORS` maps each to that same color so the Add form's verb picker matches the graph. The Add form splits the label into a verb `<select>` plus a free-text sub-name input (`addActionRow()`/`addBonusRow()`); saving rejoins them and strips spaces from the sub-name (`splitActionLabel()`/`joinActionLabel()`). A bonus's `<description>` additionally has its spaces replaced with `-` (except around a `+`, which just has the surrounding spaces removed) — e.g. `item 101 + skill` is stored as `item-101+skill` — see `formatBonusDescription()`.
  - `T:` is a free-form location type; new values are picked up automatically into autocomplete (see `DEFAULT_TYPES` in [app.js](app.js)).
  - This format is deliberately compatible with `vantage-graph.html`'s `const input = \`...\`;` template so data can be copy-pasted between the two files directly.
- **Play sessions**: a "play session" is not a separate data structure — it's just "every location line between one comment line and the next" (a date header or an explicit `// SESSION <ISO timestamp>` marker, inserted by the Graph tab's "New Session" button). Both parsers already ignore every line starting with `//` unconditionally, so these markers needed no changes to `parseAll()`, `renderGraph()`, or `vantage-graph.html` — see `getAllSessions()`/`getSessionEntries()` in [app.js](app.js). The Graph tab draws a session's route (order-of-play) as an overlay on the full map — by default the live/current session, or any past run via the session picker dropdown, which is populated from `getAllSessions()` — and lets you tap a node (or type an already-used ID in the Add tab) to reload that location's last-saved line back into the form and update it in place instead of appending a duplicate — see `loadForEdit()`/`findLastLineForId()` in [app.js](app.js). Because that update happens in place, revisiting a location first logged in an *earlier* session wouldn't otherwise show up in the current session's route; `onSave()` covers this by appending a `// VISIT <id> <ISO timestamp>` marker (via `logRevisitIfNeeded()`) whenever the line being amended predates the current session's start — another comment-line marker, so again no parser changes needed, just `getAllSessions()` treating it as a route stop rather than a session boundary.
- **Two parsers, kept manually in sync**: `parseAll()` in [app.js](app.js) (stats/autocomplete/dup-detection) and the inline `renderGraph()` port both re-implement the same line syntax independently. When changing the format, update both, plus `vantage-graph.html` if the standalone tool should keep matching.
- **File import quirk**: importing a `vantage-graph.html`-style file must use `lastIndexOf("const input = \`")`, not `indexOf`, because the file has a commented-out template line (`// const input = \`{{ $json.data }}\`;`) above the real one that also contains the marker text — see the comment at [app.js:356-359](app.js:356).
- **UI structure**: three tabs (Add / Graph / Data) toggled via `.view.active`, wired in `init()` in [app.js](app.js). Any new tab/view should follow this same pattern (a `#view-<name>` section, a tabbar button with `data-view`, and a branch in `switchView()`).
- **Styling**: no CSS framework; dark theme via CSS custom properties on `:root` in [index.html](index.html) (`--bg`, `--panel`, `--accent`, etc.). Reuse these tokens rather than hardcoding colors.
- **PWA/offline**: [sw.js](sw.js) cache-first serves everything in `ASSETS`. Any new static asset referenced by `index.html` must be added to that array and the `CACHE` version string bumped, or offline installs will keep serving stale files.
- **Versioning**: `APP_VERSION` in [app.js](app.js) (shown next to the Data tab header) is kept in sync by hand with `manifest.webmanifest`'s `version` field and `sw.js`'s `CACHE` string — all three should read the same `1.x` value. Bump the minor number for a normal release; reserve the major number for a heavy/breaking change. `sw.js`'s `CACHE` also still needs bumping (as above) on any release that changes a cached asset, even one that doesn't touch `APP_VERSION`.
- **Data persistence is planned but not built**: `localStorage` is currently the only copy of a user's location data (the Data tab's Copy/Download/Import buttons are the manual workaround). There's a future intent to add a synced or saved backup file — if asked to build this, don't assume a specific mechanism (cloud sync API, file system access, git-committed file, etc.) without checking first, since none has been chosen yet.

## Known Pitfalls / Recurring Errors

_None recorded yet — this section should be updated as mistakes surface on this codebase._

## Docs Index

_No `docs/` directory yet._
