# Lone Star Roam — next session kickoff

**No active priority track.** The Texas Brands track (Bucky's, H-E-Buddy,
Lone Star Compute — 3 waves) shipped 2026-07-12 and is folded into
`ROADMAP.md`; `BRANDS_SPEC.md` stays as history. Queued work lives in
`BACKLOG.md`; pending playtests are there too. Pick the next effort from
`BACKLOG.md` (or start a new multi-wave spec per the `CLAUDE.md` protocol) —
there's no `## Session briefing` block, so the greeting stays quiet until the
next spec writes one.

Gotchas for whoever touches `hud.js` next:
- The road shield is a CSS-3D chrome card: `this.shield` (constructor) is the
  `#road-shield-wrap` div (position/`.centered`/per-frame transform),
  `this.shieldCanvas` is the inner `<canvas id="road-shield">` (2D face
  raster). Don't conflate the two — `drawShield` draws on `shieldCanvas`,
  `animateShield` transforms `shield`.
- `drawShield`'s raster is cached on a `ref+night` key (`_shieldKey`, bumping
  `_shieldRaster` only on a real redraw) — don't add per-frame canvas work
  there; motion is a pure CSS transform via `animateShield`, called once per
  render frame from `main.js`, ungated by `__skipRender`.
- Road shields only parse clean "PREFIX ###" refs (`parseShield`) — messy
  municipal names like "Southwest Loop 410" intentionally fall through to the
  plain text line; don't try to make the regex swallow those.
- `#hud-speed`/`#hud-mode` offsets (index.html) are rem-based on purpose so
  their gap scales with UI-scale text growth — if either block grows taller,
  bump the other's `bottom` in rem too, and rerun the "never overlaps" hud
  check before shipping.

---

Background context for the session:

We're on **Lone Star Roam** (`~/claude-area/devel/tx`), the Three.js
free-roam Texas game. Before touching code read `CLAUDE.md` (architecture
+ commands + gotchas). `MODULES.md` has per-module grep anchors — prefer
grep + a targeted read over whole-file reads. `ROADMAP.md` is history;
`BACKLOG.md` holds all other queued work and pending playtests.

Key facts:
- **Repo is private, GitHub Pages is deleted** (intentional) — the game is
  not currently live/public. Verify locally only.
- Local dev: `python3 -m http.server 8317`; verify headlessly with
  **`node tools/verify.mjs`** (parallel pool, full run ~24 s; compact; `-v`
  per-check, `-j N` sets width). Add checks to `tools/checks/*.mjs`, never
  throwaway scripts.
- Verify at *natural* play values (ugly mid-drive headings, parked-truck
  distances, off-axis approaches), not convenient ones.
- If I report something broken after an update, suspect my browser cache
  first (hard refresh — python http.server sends no cache headers).
- **Ask before coding** — present an implementation plan and wait for
  the go-ahead.
