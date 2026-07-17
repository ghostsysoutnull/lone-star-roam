// New Player W4: named save slots. Single source of truth for the storage
// scheme — every base key name lives here, everything else asks for
// slotKey(base) instead of hardcoding a string. `lonestar-slot` is the only
// key that stays global; everything else is per-slot (`base:slot`).
export const SLOT_COUNT = 3;
export const KEYS = {
  save: 'lonestar-roam-save-v1',
  arrow: 'lonestar-arrow',
  compass: 'lonestar-compass',
  uiScale: 'lonestar-ui-scale',
  brandScale: 'lonestar-brand-scale',
};
const ACTIVE_KEY = 'lonestar-slot';

export function activeSlot() {
  const n = parseInt(localStorage.getItem(ACTIVE_KEY), 10);
  return n >= 1 && n <= SLOT_COUNT ? n : 1;
}

export function setActiveSlot(n) { localStorage.setItem(ACTIVE_KEY, n); }

export function slotKey(base, slot = activeSlot()) { return `${base}:${slot}`; }

// Lightweight summary for a slot NOT currently live in Gameplay — the title
// screen shows all 3 rows without constructing 3 Gameplay instances.
export function readSlotSummary(slot) {
  const raw = localStorage.getItem(slotKey(KEYS.save, slot));
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return { name: s.name || null, cities: s.cities?.length || 0, landmarks: s.landmarks?.length || 0, bank: s.bank || 0 };
  } catch {
    return null;
  }
}

export function deleteSlot(slot) {
  for (const base of Object.values(KEYS)) localStorage.removeItem(slotKey(base, slot));
}

// Copies any unsuffixed legacy key to its slot-1 form (never overwriting an
// existing slot-1 value) and marks migration done. Exposed as
// g.slots.migrateLegacy() so the verify suite can force a re-run (clear
// ACTIVE_KEY, seed legacy keys, call it) without an actual page reload —
// untestable in the harness, whose addInitScript wipes localStorage on every
// navigation.
export function migrateLegacy() {
  for (const base of Object.values(KEYS)) {
    const legacy = localStorage.getItem(base);
    if (legacy !== null && localStorage.getItem(slotKey(base, 1)) === null) {
      localStorage.setItem(slotKey(base, 1), legacy);
    }
  }
  setActiveSlot(1);
}

// Runs once at module-load time — must happen before any module reads a
// slotted key, including brands.js's module-level `let SCALE =
// ...localStorage...`, which executes at import time before any main.js
// function body runs. A module-load side effect (rather than an explicit
// main.js call) guarantees it happens first regardless of import order,
// since every module that needs a slotted key imports this one.
if (localStorage.getItem(ACTIVE_KEY) === null) migrateLegacy();
