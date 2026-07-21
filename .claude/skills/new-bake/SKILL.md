---
name: new-bake
description: Add a new baked data source to Lone Star Roam (Overpass/census/etc. → data/*.json → GEO). Use when a track needs a new offline data layer. Pass the data subject as args.
---

# New data bake

The repo's established pipeline for a new offline data layer. Reference
implementation: `tools/build-energy.mjs` (8 Overpass extracts, recorded
queries, county join) — diff it when in doubt.

## Fetching (Overpass sources)

- **GET only** — POST returns 406 from this environment:
  `curl -sG <endpoint> --data-urlencode "data=<query>"`.
- Endpoints: `maps.mail.ru/osm/tools/overpass` for heavy/large-bbox queries;
  `overpass-api.de/api/interpreter` as fallback.
- Bboxes: Texas `25.6,-107.0,36.8,-93.2`; Gulf (offshore layers only)
  `25.8,-97.6,29.9,-93.2`.
- Raw fetches land in `~/claude-area/devel/tx-inputs/` — **never in the repo**.
- **Record every query verbatim in the bake script's header comment**, with
  the verification date and source counts (build-energy.mjs pattern). The
  header is the re-fetch recipe.
- Wrong baked data → re-fetch the true source and re-bake; never massage the
  artifact (standing rule, and gate the re-bake on reproducing the shipped
  file unfixed first).

## Bake script

- `tools/build-<name>.mjs`, node-only, no deps. Header: usage line, inputs
  path default, recorded queries.
- Output: `data/<name>.json`, one file, boot-loadable size.
- Projection: equirectangular centered 31°N 99.5°W, 1 unit = 100 m — copy the
  `proj` from `tools/build-data.mjs`; do not drift the constants.
- Assert joins at bake time, loudly (precedent: 254/254 counties in
  build-ag.mjs). A silent partial join ships a hole in the world.

## Loading & accessors

- `geo.js` loads the file at boot into `GEO.<name>` alongside the other data
  files; nothing fetches at runtime.
- Per-county records: `<name>At(x,z)` = `countyAt(x,z)` → record, null outside
  Texas (the `agAt`/`energyAt` idiom).
- Site lists: read directly off `GEO.<name>` — the `GEO.cities` idiom, no
  per-list accessor.

## Consumers

- Anything placed on the ground samples `hAt(x,z)`; altitude logic uses height
  above ground, never raw `pos.y`.
- New procedural placement gets **new** `seededRand` seed strings; never
  change or re-key existing streams.
- Placement legality follows the `chapelAt` pattern: pure seeded site
  function, road/city/airport clearance checks, skip — never shrink.

## Verification & docs

- Fast determinism/shape checks → the `data` group in `tools/test.mjs`.
- Visible-layer coverage → the track's browser suite in `tools/checks/`.
- Docs: one line in `MODULES.md`, one sentence in CLAUDE.md's data-flow
  section, and the rebuild command in CLAUDE.md's Commands block.
