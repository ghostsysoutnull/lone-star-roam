# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Texas Brands track, wave 1 of 3 — build the
  `src/brands.js` scaffold (`BrandSystem`: real-coord anchor tables,
  `CitySystem`-style proximity spawn/despawn, `__game.brands` wiring,
  shared prop-prototype pattern) + the **Bucky's** brand (Buc-ee's
  parody): showpiece storefront + tall sign with a low-poly **beaver
  mascot**, heli-tier instanced fuel canopy/pumps, and the highway
  **approach billboards** (punny copy pool). Spec: `BRANDS_SPEC.md`
  (locked 2026-07-12). Scenery only — no gameplay/save/mission changes.
- **Recommended setup**: model **Opus 4.8**, effort **high** — wave 1 is
  the most structural (new streaming system + `main.js` wiring) *and* the
  beaver/canopy silhouette needs spatial care. Flag it if the running
  model differs. (Sonnet 5 high is an acceptable cheaper alternative.)
- **Budget**: code + `tools/checks/brands.mjs` checks, grep-first
  (`MODULES.md` anchors; refs — `cities.js:7,33` streaming,
  `rotors.js` `mk*Body` mesh idiom, `gameplay.js` landmark `LL()`
  table). **One `t.shot`** of Bucky's for the silhouette read (the
  visual-judgment exception) — no other shots. Counts: Bucky's ~15 real
  sites (coords confirmed this wave). Signage stays unlit.
- **Then**: rewrite this block for wave 2 (**H-E-Buddy** — red-band
  storefront in the 33 largest cities + lot props).

Gotchas carried over: `brands.js` may import only `geo.js` + `sky.js`
(ATMOS night gate) to stay cycle-free — audio (wave 3 datacenter hum) is
a constructor callback, not an import. Shared prop prototypes (beaver,
pump, cart, pylon) built once, disposed never; only per-site groups get
disposed on despawn. Placement must dodge `airportClear`/`onRunway`.

No active priority track outside this. Queued work lives in `BACKLOG.md`.

Gotchas for whoever touches `hud.js` next:
- The road shield is now a CSS-3D chrome card: `this.shield` (constructor)
  is the `#road-shield-wrap` div (position/`.centered`/per-frame transform),
  `this.shieldCanvas` is the inner `<canvas id="road-shield">` (2D face
  raster). Don't conflate the two — `drawShield` draws on `shieldCanvas`,
  `animateShield` transforms `shield`.
- `drawShield`'s raster is cached on a `ref+night` key (`_shieldKey`,
  bumping `_shieldRaster` only on a real redraw) — don't add per-frame canvas
  work there; motion is a pure CSS transform via `animateShield`, called
  once per render frame from `main.js`, ungated by `__skipRender`.
- Road shields only parse clean "PREFIX ###" refs (`parseShield`) — messy
  municipal names like "Southwest Loop 410" intentionally fall through to
  the plain text line; don't try to make the regex swallow those.
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
