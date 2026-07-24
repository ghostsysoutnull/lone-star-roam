# Map track — waves 2–4 (spec 2026-07-23)

Map W1 (big-map zoom windows, legend, lat/lon readout) + W1.1/W1.2
(world-edge iso-lines, dash banding, click-to-copy coords) shipped
2026-07-20..22. This spec covers the rest of the track, re-scoped in the
2026-07-23 spec session after Bruno's review. Two `data-scout` missions
launched that session as sidecars: the coastal building-vs-water audit
(BACKLOG placement follow-on) and the beyond-band context prefetch (feeds
W4). W2 is the **wave-protocol-amendment shakedown** (plan-grill pilot,
JSON contract file, multi-chunk + closer, challenge triage, `/wave-close`).

**Goal**: turn the maps from a picture into a planning tool — toggleable
info layers, live traffic, click-to-waypoint, real-world coordinates and
Google Maps, and neighbor context on both maps out to the world's edges.

**Wave 2 — the player gets:**
- A layer bar on the big map: Rails, Energy, Airports, Counties, Crops
- Any mix of layers draws over the map, each in its own ink
- A Base button that returns the map to its classic look in one click
- Layer choices remembered between sessions

*Expected result:* five lazily-rendered offscreen layer canvases at the
wide bounds, composited in `drawBig` under the zoom window; toggle-bar DOM
beside `#map-legend`; state persisted via the `slotKey` idiom; layer state
and canvases exposed for the `hud` suite; minimap untouched; no 3D perf
delta (2D canvas only).
*Suggested setup:* **handoff: yes**, effort **high** — settled canvas
pattern, no feel kernel. Two chunks, disjoint files (code / checks+tours),
second agent is the closer. Carries the amendment pilots.

**Wave 3 — the player gets:**
- Live traffic on the big map: trains, ships, planes and helicopters as
  tiny moving glyphs (a sixth toggle in the layer bar)
- Click the big map to set a waypoint: a pin on both maps, a compass tick,
  distance in the map header; one click to clear
- "You are here": live lat/lon with Copy and Open-in-Google-Maps buttons

*Expected result:* Traffic toggle draws per-blit dots from the live mover
systems; the W1.2 click-to-copy gesture is retired in favor of waypoint
(copy survives in the player-position widget); waypoint is session-only
(no save key); Google Maps opens via `toLatLon`. Checks: waypoint numeric
surface, mover-dot count vs system state, widget text. No 3D perf delta.
*Suggested setup:* **handoff: yes**, effort **high** — glyph ink and a
gesture swap on settled surfaces; single `wave-coder` (under the
multi-chunk threshold unless the plan grows).

**Wave 4 — the player gets:**
- The rest of the world inside the map frame: real roads and major cities
  beyond the band (the New Mexico slab, northern Mexico), muted so Texas
  stays the star
- State names always on the map: NEW MEXICO, OKLAHOMA, ARKANSAS,
  LOUISIANA, MEXICO
- The minimap finally shows the band, the context and the world edge

*Expected result:* new bake (`tools/build-context.mjs` →
`data/context.json`) from the scout's extract, gate-asserted; context ink
dimmer than band ink; state-name labels on both layers; minimap switches
its blit source to the wide layer (repeals the Shoulder-era "minimap layer
stays untouched" law — recorded in GOTCHAS at close). One staged shot,
Bruno-judged. Perf: +1 boot fetch, slightly costlier layer render, no 3D
delta.
*Suggested setup:* **handoff: yes**, effort **high** — bake execution on
the scout's numbers plus muted ink on the band-backdrop precedent.

---

## Resolved calls (spec session, 2026-07-23)

- **No collectibles layer** (Bruno). Only save-coupled layer candidate —
  dropped entirely.
- **Click = waypoint, nothing else.** W1.2's click-to-copy is repealed
  (its code comment reserved click for bug reports; the player-position
  Copy in the W3 widget covers that use). Cursor-copy is not retained.
- **Copy / Google Maps are player-position only** (Bruno) — no pin popup,
  no per-click coordinate UI.
- **Trains ride the Traffic layer** — the rails layer shows the lines, the
  dots complete the picture.
- **Layers are big-map only; the minimap gains base content, never
  toggles or traffic** — it stays a clean glance surface.
- **Base look changes in W4**: neighbor context is base-canvas content
  (the only way the minimap gets it), so Base resets toggles but the
  muted context stays. Accepted in review.
- **Map extent does not widen.** W4 fills the existing wide rectangle's
  beyond-band slabs; nothing outside it is fetched or drawn.
- **Google Maps is the single external target** — one button; copied
  `lat, lon` works everywhere else.
- **Ordering W2 → W3 → W4** — player-facing wins first, bake last with
  maximum scout lead time. Slot export/import queues after the track.

## Wave 2 — design settled

- **Layer sources** (all already in `GEO`/globals, no new data):
  - *Rails*: `GEO.rails` + `GEO.bandRails` (band faded, per band law).
  - *Energy*: `GEO.energy` site lists — `windFarms`/`plants`/`refineries`/
    `substations`/`platforms` as glyphs, `lines345` as polylines.
  - *Airports*: `AIRPORTS` incl. band fields, glyph by tier.
  - *Counties*: `counties.json` + `neighbor-counties.json` boundaries,
    thin ink; no fills.
  - *Crops*: county tint by `GEO.ag` `dominantCrop`, palette derived from
    world.js `CROP_STYLE`.
- **Rendering**: one offscreen canvas per layer at the wide layer's
  bounds/transform (`mapT`/`mapSc`), rendered on first toggle, cached;
  composited in `drawBig` between the base blit and dynamic markers, same
  window transform. Boot cost zero.
- **Toggle bar**: new DOM block by `#map-legend`, rem-based CSS; five
  layer buttons + **Base** (clears all). Persisted in localStorage via a
  new `KEYS` entry (`slotKey` idiom).
- **Exposure**: layer on/off state + per-layer canvas getter on `hud`,
  asserted by the `hud` suite (composite = numeric canvas sampling, not
  screenshots).
- **Chunks**: chunk 1 `src/hud.js` + `index.html`; chunk 2 (closer)
  `tools/checks/hud.mjs` + `src/debug.js` action ("all layers on") +
  `src/tours.js`. Style/glyph tables go in the wave's JSON contract file.
- **Session rider** (not part of the wave; Bruno approved 2026-07-23):
  the `cities.js` building-containment fix chunk — contract and audit
  numbers in BACKLOG's "Placement audit follow-on" entry.
- Player-visible strings (proposed, Bruno approves at plan time): `Rails`,
  `Energy`, `Airports`, `Counties`, `Crops`, `Base`.

## Wave 3 — design settled

- **Mover sources** (read-only, one enumeration each): `trains` consists,
  `maritime.ships` + `shrimpers`, `radio.sources` (the aviation
  enumeration already built for chatter + HUD tags — this is its third
  consumer, no new scan).
- **Glyphs**: per-class colored dots/arrows drawn at blit rate in
  `drawBig` (and only there); glyph table in the contract file.
- **Waypoint**: click → `mapInv` world point (the existing W1.2 code
  path); pin on both maps + compass tick + header distance; re-click near
  the pin or a Clear control removes it; session-only, no save key, no
  guide arrow (the missions arrow stays missions-only).
- **Widget**: `#map-coords` grows Copy + Google Maps buttons acting on the
  player position (`toLatLon`); Google Maps via
  `https://maps.google.com/?q=<lat>,<lon>`.
- Checks in the `hud` suite: waypoint set/clear numeric surface, dot count
  vs live system counts, widget text. Debug action forces a waypoint.

## Wave 4 — design settled (pending scout numbers)

- **Bake**: `tools/build-context.mjs` over the scout's
  `map-context-*.json` fetches → `data/context.json` (roads simplified to
  the scout's recommended tolerance, cities above its recommended
  population floor). Gate asserts nonzero road km per slab + expected
  named cities. Prefer-true-source rules apply; queries recorded in the
  script header.
- **Draw**: context roads/cities under band content in `renderMapLayer`,
  ink hierarchy **Texas > band > context** (context dimmest); silver-class
  city marks per the "gold is Texas" law.
- **Labels**: state names at `GEO.neighborStates` ring anchors + MEXICO
  along the southern slab; small faded caps; on both mini and wide
  renders.
- **Minimap**: `drawMini` re-targets the wide canvas (own transform
  math); minimap zoom levels unchanged; the Texas-only minimap law is
  repealed in GOTCHAS with this wave's entry.
- **Scout numbers** (prefetch landed 2026-07-23; inputs
  `~/claude-area/devel/tx-inputs/map-context-*.json`, queries recorded in
  `map-context-QUERIES.txt` there — the bake script header re-records
  them per convention): wide rectangle = lat 24.83–36.86,
  lon −107.07..−92.34. Beyond-band US roads **20,013 km** (NM 4,933 /
  OK 8,542 / AR 4,568 / LA 1,970) and 185 places across NM/OK/AR/LA
  (+3 in a Missouri sliver) incl. Albuquerque, Santa Fe, Oklahoma City,
  Tulsa. The shipped band clips uniformly at 402u while the east canvas
  pads to `SHELF_U` — a blank LA/AR strip today; the context layer fills
  it. Mexico: **6,839 km + 148 places** incl. Monterrey (1.14M),
  Chihuahua, Ciudad Juárez — zero band coverage by design. DP tolerance
  0.0025° (the band-bake precedent) keeps 16–38% of points; Mexico
  place-count sweep: pop ≥20k → 51, ≥50k → 33, ≥100k → 29.
- **Resolved on the scout's report** (spec session): context is a
  **separate map-only overlay** (`data/context.json`) — never merged
  into the band arrays (geo.js law: nothing may perturb the band's
  gameplay indexes; Mexico is non-roamable). The map stays
  **rectangle-clipped**: the "Monterrey effect" (the frame reaching
  ~200 km past the local border at central longitudes) is kept as a
  feature — distant real metros anchor the diorama. The bake must
  classify with the game's island-aware `inTexas()` (the scout's
  mainland-only approximation misclassified Port Aransas).
- Remaining W4-plan knob (only one): place-population cutoffs, US vs
  Mexico — picked from the sweep numbers at plan time.
- **Airports-toggle rework rider** (Bruno, 2026-07-24, W3 review): the
  base layer already draws every airport as a tier-sized ✈ (both maps),
  so the W2 Airports toggle's rings are near-duplicate ink. Rework the
  toggle into the airport *detail* layer: toggled on, it forces the
  airport codes always-on (today zoom-gated occasional via
  `airportLabels`) alongside the tier rings — base says "airport here",
  toggle says "which and what tier". ~15 lines in hud.js + a hud-suite
  check tweak; rides W4 since that wave repaints the same canvases.
