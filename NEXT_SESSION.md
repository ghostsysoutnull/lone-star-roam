# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Texas Brands track, wave 3 of 3 — **Lone Star
  Compute** (AI-datacenter parody): one or two windowless **server-shed**
  heroes (ribbed roofline, small office block, perimeter fence posts),
  heli-tier instanced **cooling banks** (roof/side fan units + rooftop
  condenser drums), a **substation + pylon line** flourish (greebled
  transformer boxes + instanced lattice pylons marching toward the shed),
  and `audio.datacenterHum(dist)` (mirrors `audio.heli(dist)`, proximity
  gain, `datacenterTarget` exposed for tests). ~8 hand-authored real coords
  (Abilene "Stargate" site, Corsicana, San Antonio, Sweetwater, Temple,
  Amarillo, Red Oak, Denton — confirm final list against current news/OSM
  at session start). **Night glow** = cooling-vent glow — this one *is*
  emissive (a deliberate cold-vs-warm contrast with Bucky's/H-E-Buddy's
  real-light signage), gated on `ATMOS.night`, per BRANDS_SPEC.md. Wave 2
  (H-E-Buddy: big-box hero + red sign band + 33-site placement search +
  lot props) shipped 2026-07-12, commit (this session's, see git log).
- **Recommended setup**: model **Opus 4.8**, effort **high** — most
  systems touched this wave (new audio method + emissive gating + two
  kinds of instanced infrastructure + real coords needing a freshness
  check). Flag it if the running model differs.
- **Budget**: code + new checks in `tools/checks/brands.mjs`, grep-first.
  **One `t.shot`** of Lone Star Compute for the read — no other shots.
  `onHum` is already wired as a constructor callback param (unused since
  wave 1) — this is the wave that calls it; `main.js` must wire it to
  `audio.datacenterHum` the same way other proximity sounds are wired
  (grep `onHonk`/`onBark` in traffic.js/dog.js for the pattern). Hum test
  mirrors the existing `heliTarget` pattern in `tools/checks/*` — step
  `audio.datacenterHum(dist)` across distances, assert `datacenterTarget`
  rises as distance shrinks and is 0 out of range.
- **Then**: this is the **last wave** — delete this whole session-briefing
  block, fold Texas Brands (all 3 waves) into one `ROADMAP.md` entry, and
  leave `BRANDS_SPEC.md` as history (per the multi-wave protocol).

Gotchas carried over (from waves 1-2):
- `brands.js` imports **geo + sky + traffic** (`tinted`/`merge`) +, since
  wave 2, **cities.js** (`cityRadius`) + **airports.js** (`airportClear`)
  for H-E-Buddy's placement search. All cycle-safe (nothing imports
  brands.js) — adding datacenter's substation/pylon builders needs no new
  imports beyond what's already there.
- `BrandSystem` is built around **shared materials** (`heroMat`/`propMat`)
  + **shared prototype geos** in `this.shared` (disposed never; `despawn`
  skips them). Add Lone Star Compute's prototypes (cooling-fan unit,
  condenser drum, pylon) to `this.shared` the same way.
- **Night lighting for Bucky's + H-E-Buddy is REAL LIGHTS, not emissive**
  (re-decided in wave 1 after playtest) — three persistent `PointLight`s
  now exist (`canopyLight`/`signLight` for Bucky's, `hebSignLight` for
  H-E-Buddy), each repositioned in `update()` to the nearest live site of
  its own brand type (`rec.type === 'heb'` vs the Bucky's branch), using
  the group's Y-rotation trig (NOT `localToWorld`, which reads a stale
  matrixWorld on a fresh group and drops the light at the world origin).
  **Lone Star Compute's cooling-vent glow is the one exception — spec
  calls for emissive there** (cold cast, deliberate contrast with the
  warm signage lighting) — don't add a 4th persistent light for it.
- `this.live` is now keyed by **bare city name for Bucky's** but
  **`'heb:'+name` for H-E-Buddy** (name collisions exist across the two
  tables — Denton, Temple). Datacenter sites should get their own prefix
  too (e.g. `'lsc:'+name`) for the same reason, and `rec.type` needs a
  third value (`'lsc'`) so the per-brand light-finding loop in `update()`
  can tell all three apart.
- `BUCKY_SITES` is a module const; `HEB_SITES` is built at construct time
  via `buildHEBSites()` (needs `GEO.cities`, unavailable at module load —
  `main.js` awaits `loadGeo()` before constructing `BrandSystem`, so the
  constructor is safe). Lone Star Compute's ~8 sites are hand-authored
  real coords (like Bucky's), so a module-const table is fine — no
  placement search needed.
- Streaming `update(px, pz, dt)` throttles at 0.25 s accumulated dt; the
  verify streaming sentinel drives the **real loop** (`t.until` on
  `brands.live.has(key)`, no manual `update()` call) — keep that shape.
- H-E-Buddy's 33-site placement search (seeded angle + growing radius,
  snap to `nearestRoad`, offset away from downtown, reject on
  `airportClear`/downtown-radius overlap) converged on attempt 0 for all
  33 real cities in a dry run — don't be surprised if it looks
  over-provisioned with retries; it's a safety net, not the common case.

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
