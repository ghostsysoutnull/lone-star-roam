# Lone Star Roam — next session kickoff

## Session briefing
- **This session**: Texas Brands track, wave 2 of 3 — the **H-E-Buddy**
  brand (H-E-B parody): a big-box **storefront hero** (wide box + raised
  entry parapet + curved entry canopy), the **red "H-E-Buddy" sign band**
  across the front (tinted lettering block, reads by color + proportion),
  and heli-tier lot props (instanced cart corrals/carts, lot light poles,
  a back loading dock). Placed on a **city-edge road shoulder in the 33
  largest `GEO.cities`** (reuse the city list) via a clear-spot query so it
  never overlaps a downtown building or runway. **Night glow** = the red
  sign band only, emissive on `ATMOS.night`. Wave 1 (Bucky's scaffold +
  streaming) shipped 2026-07-12, commit ead3ad6.
- **Recommended setup**: model **Opus 4.8** or **Sonnet 5**, effort
  **high** — mesh + table plumbing (one new brand into the existing
  `BrandSystem`), less structural than wave 1. Flag it if the running
  model differs.
- **Budget**: code + new checks in `tools/checks/brands.mjs`, grep-first.
  **One `t.shot`** of H-E-Buddy for the read — no other shots. 33 real
  coords come from `GEO.cities` (sort by pop, take 33) — no OSM fetch
  needed. Placement must dodge `airportClear`/`onRunway` **and** the
  procedural downtown footprint (`cities.js` `cityRadius` gives the
  downtown radius to place *outside*). Note: `roadShoulder` in npcs.js is
  a good clear-spot idiom but is **module-private** — export it or mirror
  the pattern in brands.js, don't assume it's importable. Night glow
  asserts toggle + ~0 by day.
- **Then**: rewrite this block for wave 3 (**Lone Star Compute** — server
  sheds + cooling banks + substation/pylon line + `audio.datacenterHum`).

Gotchas carried over (from wave 1):
- `brands.js` imports **geo + sky + traffic** (`tinted`/`merge`) — the
  spec said geo+sky only, but the rotors mesh idiom needs the traffic kit;
  it's cycle-safe (nothing imports brands). Keep it that way.
- The wave-1 `BrandSystem` is built around **shared materials**
  (`heroMat`/`propMat`) + **shared prototype geos** in `this.shared`
  (disposed never; `despawn` skips them). Add H-E-Buddy's prototypes to
  `this.shared` the same way.
- **Night lighting is REAL LIGHTS, not emissive** (re-decided in wave 1
  after playtest — emissive can't keep colours true; see BRANDS_SPEC.md).
  Bucky's uses two persistent `PointLight`s (`canopyLight`/`signLight`)
  created once, repositioned in `update()` to the nearest live site's
  world anchors (transformed by the group's Y-rotation trig — NOT
  `localToWorld`, which reads a stale matrixWorld on a fresh group and
  drops the light at the world origin). **H-E-Buddy should follow the same
  pattern**: add its own light(s) to the persistent pool (or extend the
  nearest-site logic to pick the nearest of *either* brand) and fade by
  `ATMOS.night`. Do NOT add/remove lights per spawn (shader recompile).
- `BUCKY_SITES` is a module const; H-E-Buddy sites derive from
  `GEO.cities` at construct time (city list isn't available at module
  load — build the table in the constructor or lazily in `update`).
- Streaming `update(px, pz, dt)` throttles at 0.25 s accumulated dt; the
  verify streaming sentinel drives the **real loop** (`t.until` on
  `brands.live.has(name)`, no manual `update()` call) — keep that shape.
- `onHum` constructor callback is still reserved for wave 3 (unused).

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
