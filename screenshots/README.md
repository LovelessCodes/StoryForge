# Screenshots

These images are embedded in the project README. Each one is a diagonal
composite of the same 1200×800 app window in both themes: the light capture
fills the top-left triangle, the dark capture the bottom-right, split along the
bottom-left-to-top-right diagonal. The result ships as WebP (see "Why WebP"
below).

| File                  | Page                  |
| --------------------- | --------------------- |
| `profiles.webp`       | Profiles list         |
| `mods.webp`           | Mod browser           |
| `adding-mod.webp`     | Add-mod sheet open    |
| `versions.webp`       | Game versions         |
| `worlds.webp`         | Worlds                |
| `public-servers.webp` | Public server browser |
| `servers.webp`        | Saved servers         |
| `hosting.webp`        | Dedicated hosting     |
| `mod-configs.webp`    | Mod config editor     |
| `news.webp`           | News                  |
| `settings.webp`       | Settings              |

## Refresh pipeline

Capture is headless: no app window, no game install, no clicking. The build
runs the real frontend with the Tauri backend stubbed out (see "How the capture
works").

```sh
bunx playwright install chromium   # once per machine
bun run build                     # required: the capture serves dist/
bun run screenshots:capture       # writes NAME.light.png / NAME.dark.png
bun run screenshots               # composites them into the committed WebPs
```

`bun run screenshots:capture` takes `--only profiles,mods` to capture a subset,
`--dir` to write elsewhere and `--port` for the preview server. The compositor
takes `--keep`, `--width`, `--quality` and `--dir`; it deletes the PNG pairs
unless `--keep` is passed.

### On release

`.github/workflows/screenshots.yml` runs when a release is published (or via
manual dispatch). It builds the frontend, captures every page in both themes,
composites the WebPs and opens a `chore/refresh-screenshots` PR against
`release`. Review the renders and merge when the pages look right.

## How the capture works

`scripts/screenshots/capture.ts` serves `dist/` with `vite preview` and drives
headless Chromium at the app's 1200×800 window size, twice that for Retina
crispness, once per theme. Before any app code runs it installs a fake
`window.__TAURI_INTERNALS__` whose `invoke` resolves against local fixtures — no
Rust process, no game files. Everything else (pages, components, styles) is the
code that ships.

- `scripts/screenshots/fixtures.ts` — one response per command the frontend
  calls: profiles, installed versions, the mod database page, installed mods,
  updates, saves, saved/public/hosted servers, mod configs and news.
- `capture.ts`'s `shots` array — one entry per committed image. Each entry opens
  its hash route and waits for a marker that proves the page finished loading.

Adding a page: add a shot entry, iterate with
`bun run screenshots:capture --only <name>`, then composite.

Changing what a page shows: edit the fixtures. Keep the data plausible and
deterministic — dates are fixed ISO strings that the UI renders as relative
time, and the light/dark captures must show the exact same state or the diagonal
seam won't line up. Local paths in fixtures use `/Users/you/…` so published
images don't leak a real username.

## Why WebP

PNG captures from a Retina display are 2–4 MB each; the whole README would be
tens of megabytes. WebP at 1200px/quality 88 keeps text crisp at one tenth of
the size, which keeps clone and page weight down.
