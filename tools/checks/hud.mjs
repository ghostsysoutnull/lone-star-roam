// HUD/DOM at natural play values (the compass-only-tested-at-0/90 lesson).
// HUD text updates at ~12 Hz — allow a tick via t.until. One-shot keys go
// through real KeyboardEvents (t.key), the same path a player's keys take.

export default async function hud(t) {
  const austin = await t.ev(`(() => { const c = g.GEO.cities.find((c) => c.name === 'Austin'); return { x: c.x, z: c.z }; })()`);
  // shared by the 3D-shield checks below: park on the nearest Austin-area
  // interstate so a real chrome shield is on screen to measure
  const parkOnInterstate = async () => {
    await t.tp(austin.x, austin.z + 12);
    await t.ev(`(() => {
      const r = g.nearestRoad(g.player.pos.x, g.player.pos.z, 400, (ty) => ty === 'motorway');
      g.player.pos.set(r.x, 0, r.z);
    })()`);
    await t.until(`g.hud.shieldInfo?.shape === 'interstate'`, 8000);
  };

  await t.check('location line: distance, direction, county', async () => {
    await t.tp(austin.x + 18, austin.z - 18); // 25.5 units NE, mid-block nowhere special
    await t.until(`g.hud.els.location.textContent.includes('of Austin')`, 8000);
    const loc = await t.ev('g.hud.els.location.textContent');
    t.ok(/2\.[45] km NE of Austin/.test(loc), `bad distance/direction: "${loc}"`);
    t.ok(loc.includes('Travis Co.'), `county missing: "${loc}"`);
  });

  await t.check('A1: HUD shows airport name/code inside its footprint, city line just outside it', async () => {
    const dal = await t.ev(`(() => {
      const L = g.airports.layout.find((x) => x.id === 'DAL');
      const r = L.rws[0]; // far runway end, off the anchor
      const [A, , C] = L.corners, cx = (A[0] + C[0]) / 2, cz = (A[1] + C[1]) / 2;
      return { end: [r.x1, r.z1], outside: [A[0] + (A[0] - cx) * 0.4, A[1] + (A[1] - cz) * 0.4] };
    })()`);
    await t.tp(dal.end[0], dal.end[1], 'WALK');
    await t.until(`g.hud.els.location.textContent.includes('Love Field (DAL)')`, 8000);
    const inside = await t.ev('g.hud.els.location.textContent');
    t.ok(inside.startsWith('🛫'), `airport line missing the tower glyph: "${inside}"`);
    await t.tp(dal.outside[0], dal.outside[1], 'WALK');
    await t.until(`!g.hud.els.location.textContent.includes('Love Field')`, 8000);
    const outside = await t.ev('g.hud.els.location.textContent');
    t.ok(!outside.includes('🛫') && outside.includes('📍'), `still airport-styled just outside the footprint: "${outside}"`);
  });

  await t.check('A5: big-map airport code labels are real per-field data (all 27 fields)', async () => {
    const r = await t.ev(`(() => {
      const labels = g.hud.airportLabels();
      const ids = new Set(labels.map((l) => l.id));
      const missing = g.AIRPORTS.filter((a) => !ids.has(a.id)).map((a) => a.id);
      return { n: labels.length, missing };
    })()`);
    t.ok(r.n === 27, `expected 27 airport labels, got ${r.n}`); // 21 Texas + 6 Shoulder & Shelf W2 band
    t.ok(r.missing.length === 0, `missing labels for: ${r.missing.join(', ')}`);
  });

  await t.check('parking on the interstate shows a shield, not a duplicate text ref', async () => {
    await t.tp(austin.x, austin.z + 12);
    await t.ev(`(() => {
      const r = g.nearestRoad(g.player.pos.x, g.player.pos.z, 400, (ty) => ty === 'motorway');
      g.player.pos.set(r.x, 0, r.z);
    })()`);
    await t.until(`g.hud.shieldInfo?.shape === 'interstate'`, 8000);
    const { info, txt } = await t.ev(`({ info: g.hud.shieldInfo, txt: g.hud.els.road.textContent })`);
    t.ok(info.num === '35', `expected I-35 near Austin, parsed num "${info.num}"`);
    t.ok(!txt.includes('🛣'), `text ref should be suppressed once the shield renders: "${txt}"`);
  });

  await t.check('rail placard shows the nearby OSM operator/line and adopts the night theme', async () => {
    const sample = await t.ev(`(() => {
      for (const rail of g.GEO.rails) {
        const pt = rail.pts[Math.floor(rail.pts.length / 2)];
        if ((rail.operator || rail.name) && !g.nearestRoad(pt[0], pt[1], 6))
          return { pt, label: [rail.operator, rail.name].filter((v, i, a) => v && a.findIndex((x) => x?.toLowerCase() === v.toLowerCase()) === i).join(' · ') };
      }
      return null;
    })()`);
    t.ok(sample, 'no labeled rail sample clear of a road shield');
    await t.tp(sample.pt[0], sample.pt[1], 'WALK');
    await t.until(`!!g.hud.railInfo`, 8000);
    const day = await t.ev(`({
      name: g.hud.railInfo.name,
      display: document.getElementById('rail-placard').style.display,
    })`);
    t.ok(day.name === sample.label, `rail placard "${day.name}" != OSM label "${sample.label}"`);
    t.ok(day.display === 'block', `rail placard display is "${day.display}"`);
    await t.setNight();
    await t.until(`document.getElementById('rail-placard').classList.contains('night')`, 8000);
    const night = await t.ev(`document.getElementById('rail-placard').classList.contains('night')`);
    t.ok(night, 'rail placard did not use its night theme');
    await t.setDay();
    await t.tp(austin.x + 18, austin.z - 18, 'DRIVE');
  });

  await t.check('speed readout tracks mph = |speed|·2.4', async () => {
    await t.tp(austin.x + 18, austin.z - 18, 'DRIVE');
    await t.until(`(() => {
      const shown = parseInt(g.hud.els.speed.textContent.match(/\\d+/)?.[0] ?? '-1', 10);
      return shown === 0 && g.player.speed === 0;
    })()`, 8000); // parked
    await t.hold('KeyW');
    await t.simStep(1.5); // instantly at the road cap; W stays held so it sits there
    // wait for DOM and live speed to cohere, not just first-nonzero — the
    // first climbing tick can show "1 mph" a whole hudTick before this read
    await t.until(`(() => {
      const shown = parseInt(g.hud.els.speed.textContent.match(/\\d+/)?.[0] ?? '-1', 10);
      return shown > 0 && Math.abs(shown - Math.abs(g.player.speed) * 2.4) < 25;
    })()`, 8000);
    const { txt, spd } = await t.ev(`({ txt: g.hud.els.speed.textContent, spd: g.player.speed })`);
    await t.release();
    const shown = parseInt(txt.match(/\d+/)?.[0] ?? '-1', 10);
    // HUD lags up to a 12 Hz tick behind the live speed — generous band
    t.ok(shown > 0 && Math.abs(shown - Math.abs(spd) * 2.4) < 25, `shows ${shown} mph at speed ${spd.toFixed(1)}`);
  });

  await t.check('M toggles the big map (real key event)', async () => {
    const d0 = await t.ev(`g.hud.big.style.display`);
    await t.key('KeyM');
    const d1 = await t.ev(`g.hud.big.style.display`);
    await t.key('KeyM');
    const d2 = await t.ev(`g.hud.big.style.display`);
    t.ok(d1 !== d0 && d1 !== 'none', `map did not open (${d0} → ${d1})`);
    t.ok(d2 === 'none', `map did not close (${d1} → ${d2})`);
  });

  await t.check('C toggles the compass and persists the preference', async () => {
    await t.key('KeyC');
    const off = await t.ev(`({ disp: g.hud.compass.style.display, pref: localStorage['lonestar-compass'], centered: g.hud.shield.classList.contains('centered') })`);
    await t.key('KeyC');
    const on = await t.ev(`({ disp: g.hud.compass.style.display, pref: localStorage['lonestar-compass'], centered: g.hud.shield.classList.contains('centered') })`);
    t.ok(off.disp === 'none' && off.pref === 'off', `off state: ${JSON.stringify(off)}`);
    t.ok(on.disp !== 'none' && on.pref === 'on', `on state: ${JSON.stringify(on)}`);
    t.ok(off.centered === true && on.centered === false, `road-shield did not re-center with the compass: ${JSON.stringify({ off, on })}`);
  });

  await t.check('road shield renders for numbered routes without duplicating the text ref', async () => {
    const spot = await t.ev(`(() => {
      // a midpoint, not an endpoint — chained ways of a different ref often
      // share endpoint coordinates, so pts[0] can tie-break to the wrong road
      const mid = (h) => h.pts[Math.floor(h.pts.length / 2)];
      const find = (re, wantStreet) => {
        const h = g.GEO.highways.find((x) => re.test(x.ref) && (wantStreet ? x.type === 'street' : true));
        return h && { ref: h.ref, pt: mid(h) };
      };
      return {
        i: find(/^I ?\\d+[EW]?$/),
        us: find(/^US ?\\d+$/),
        sh: find(/^TX ?\\d+$/),
        fm: find(/^FM ?\\d+$/),
        street: find(/^(?!I |US |TX |FM |RM |BW )[A-Za-z].* /),
      };
    })()`);
    for (const [key, shape] of [['i', 'interstate'], ['us', 'us'], ['sh', 'circle'], ['fm', 'circle']]) {
      const s = spot[key];
      t.ok(s, `no sample road found for ${key}`);
      await t.tp(s.pt[0], s.pt[1]);
      await t.until(`g.hud.shieldInfo?.shape === '${shape}'`, 8000);
      const info = await t.ev('g.hud.shieldInfo');
      t.ok(info.num && s.ref.includes(info.num), `${key}: parsed num "${info.num}" not in ref "${s.ref}"`);
    }
    const st = spot.street;
    t.ok(st, 'no plain-street sample found');
    await t.tp(st.pt[0], st.pt[1]);
    await t.until(`g.hud.els.road.textContent.includes('🛣')`, 8000);
    const { info, txt } = await t.ev(`({ info: g.hud.shieldInfo, txt: g.hud.els.road.textContent })`);
    t.ok(info === null, `expected no shield on a plain street, got ${JSON.stringify(info)}`);
    t.ok(txt.includes(st.ref), `plain street ref missing from text line: "${txt}"`);
  });

  await t.check('3-char interstate refs (loops, directional suffixes) shrink to fit the shield', async () => {
    // the convenient "I 20"/"I 35" case fits at full size — these longer real
    // Texas refs (San Antonio/Houston/Dallas loops, split I-35/I-69) are the
    // natural-value case that actually exercises the shrink-to-fit path
    const spots = await t.ev(`(() => {
      const want = ['I 410', 'I 610', 'I 635', 'I 35W', 'I 35E', 'I 69E'];
      return want.map((ref) => {
        const h = g.GEO.highways.find((x) => x.ref === ref);
        return h && { ref, pt: h.pts[Math.floor(h.pts.length / 2)] };
      });
    })()`);
    for (const s of spots) {
      t.ok(s, 'missing sample road for a 3-char interstate ref');
      await t.tp(s.pt[0], s.pt[1]);
      await t.until(`g.hud.shieldInfo?.shape === 'interstate'`, 8000);
      const { info, fit } = await t.ev(`({ info: g.hud.shieldInfo, fit: g.hud.shieldFit })`);
      t.ok(`${info.num}${info.tag ?? ''}` === s.ref.replace(/^I ?/, ''), `parsed "${info.num}${info.tag ?? ''}" from ref "${s.ref}"`);
      t.ok(fit.width <= fit.max + 0.5, `"${s.ref}" label overflows the shield: ${fit.width.toFixed(1)}px > ${fit.max.toFixed(1)}px`);
    }
  });

  await t.check('3D shield sway sign tracks steering input (charging-deer discipline)', async () => {
    await t.tp(-2767, 334); // clean I-10 west stretch, road-free bubble for a clean drive
    await t.hold('KeyW');
    await t.hold('KeyA');
    await t.simStep(1.5);
    await t.until(`Math.abs(g.hud.shieldSway) > 2 && Math.sign(g.hud.shieldSway) === Math.sign(g.player.tilt)`, 4000);
    const left = await t.ev(`({ sway: g.hud.shieldSway, tilt: g.player.tilt })`);
    t.ok(Math.sign(left.sway) === Math.sign(left.tilt), `left steer: sway ${left.sway.toFixed(2)} tilt ${left.tilt.toFixed(3)}`);
    t.ok(Math.abs(left.sway) > 2, `left sway too small to be a meaningful lean: ${left.sway.toFixed(2)}`);
    await t.hold('KeyA', false);
    await t.hold('KeyD');
    await t.simStep(1.5);
    await t.until(`Math.sign(g.hud.shieldSway) === Math.sign(g.player.tilt) && Math.sign(g.hud.shieldSway) === ${-Math.sign(left.sway)}`, 4000);
    const right = await t.ev(`({ sway: g.hud.shieldSway, tilt: g.player.tilt })`);
    await t.release();
    t.ok(Math.sign(right.sway) === Math.sign(right.tilt), `right steer: sway ${right.sway.toFixed(2)} tilt ${right.tilt.toFixed(3)}`);
    t.ok(Math.sign(right.sway) === -Math.sign(left.sway), `sway did not flip sign: left ${left.sway.toFixed(2)} right ${right.sway.toFixed(2)}`);
  });

  await t.check('night flips the shield to amber wireframe and genuinely re-rasters', async () => {
    await parkOnInterstate();
    await t.setDay();
    await t.until(`g.hud.shieldNight === false`, 4000);
    const before = await t.ev(`g.hud._shieldRaster`);
    await t.setNight();
    await t.until(`g.hud.shieldNight === true`, 4000);
    const after = await t.ev(`({ raster: g.hud._shieldRaster, cls: g.hud.shield.classList.contains('night') })`);
    t.ok(after.cls, 'wrap missing .night class once ATMOS.night crosses the threshold');
    t.ok(after.raster > before, `raster did not bump across day→night: ${before} → ${after.raster}`);
    await t.setDay();
    await t.until(`g.hud.shieldNight === false`, 4000);
    const dayCls = await t.ev(`g.hud.shield.classList.contains('night')`);
    t.ok(!dayCls, 'wrap kept .night class after returning to day');
  });

  await t.check('shield raster is cached — same ref/night-state does not re-rasterize every HUD tick', async () => {
    await parkOnInterstate();
    const r0 = await t.ev(`g.hud._shieldRaster`);
    await t.wait(0.5); // several ~12 Hz HUD ticks, same ref + night-state throughout
    const r1 = await t.ev(`g.hud._shieldRaster`);
    await t.wait(0.5);
    const r2 = await t.ev(`g.hud._shieldRaster`);
    t.ok(r1 === r0 && r2 === r0, `raster count climbed while parked, motion should be CSS-only: ${r0} → ${r1} → ${r2}`);
  });

  await t.check('enlarged 3D shield never overlaps the compass, at default and high UI scale', async () => {
    await parkOnInterstate();
    const rects = () => t.ev(`({
      shield: document.getElementById('road-shield-card').getBoundingClientRect(), // the rotating element, not the static outer wrap
      compass: document.getElementById('compass').getBoundingClientRect(),
    })`);
    const noOverlap = (a, b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
    const sweep = async (label) => {
      for (let i = 0; i < 4; i++) { // sample across the idle-float cycle, not just one frame
        const r = await rects();
        t.ok(noOverlap(r.shield, r.compass), `overlap ${label} (sample ${i}): shield ${JSON.stringify(r.shield)} compass ${JSON.stringify(r.compass)}`);
        await t.wait(0.3);
      }
    };
    await sweep('at 100%');
    for (let i = 0; i < 10; i++) await t.key('Equal'); // up to the 200% clamp
    await sweep('at high UI scale');
    for (let i = 0; i < 10; i++) await t.key('Minus'); // restore baseline
  });

  await t.check('HUD speed readout never overlaps the mode line at any UI scale', async () => {
    const rects = () => t.ev(`({
      speed: document.getElementById('hud-speed').getBoundingClientRect().top,
      mode: document.getElementById('hud-mode').getBoundingClientRect().bottom,
    })`);
    const base = await rects();
    t.ok(base.speed >= base.mode, `overlap at 100%: speed.top ${base.speed.toFixed(0)} vs mode.bottom ${base.mode.toFixed(0)}`);
    for (let i = 0; i < 10; i++) { // 10%-per-step up to the 200% clamp
      await t.key('Equal');
      const r = await rects();
      t.ok(r.speed >= r.mode, `overlap at step ${i + 1}: speed.top ${r.speed.toFixed(0)} vs mode.bottom ${r.mode.toFixed(0)}`);
    }
    for (let i = 0; i < 10; i++) await t.key('Minus'); // restore baseline for later checks
  });

  // The rows are one bottom-anchored column precisely so this gap can't drift:
  // the speed block is shorter in WALK (no odometer, emoji for digits), which
  // when every row was anchored on its own left the mode line 23px off the speed
  // readout on foot and 6px off it driving. Gap is the column's, so it's uniform.
  await t.check('lower-right HUD keeps one gap between the mode line and the speed readout', async () => {
    const gap = `(() => {
      const s = document.getElementById('hud-speed').getBoundingClientRect();
      const m = document.getElementById('hud-mode').getBoundingClientRect();
      return +(s.top - m.bottom).toFixed(1);
    })()`;
    const at = async (mode, y = 0) => { await t.tp(-2767, 334, mode, y); await t.wait(0.4); return t.ev(gap); };
    const drive = await at('DRIVE'), fly = await at('FLY', 12), walk = await at('WALK');
    // 0.8rem at the 10px baseline root — tight enough to read as one cluster
    t.near(drive, 8, 1.5, `drive gap ${drive}px, expected the column's 0.8rem`);
    t.near(fly, drive, 0.5, `fly gap ${fly}px drifted from drive's ${drive}px`);
    t.near(walk, drive, 0.5, `walk gap ${walk}px drifted from drive's ${drive}px`);
    await t.tp(-2767, 334, 'DRIVE');
  });

  await t.check('stamina bar shows only when relevant and reflects the tank level', async () => {
    await t.tp(austin.x - 300, austin.z - 40, 'WALK');
    await t.ev('(g.player.stamina = 1, g.player.sprinting = false)');
    await t.wait(0.15); // one HUD tick (~12 Hz)
    t.ok((await t.ev("document.getElementById('hud-stamina').style.opacity")) === '0', 'stamina bar visible at a full tank');

    await t.ev('(g.player.stamina = 0.6)');
    await t.wait(0.15);
    t.ok((await t.ev("document.getElementById('hud-stamina').style.opacity")) === '1', 'stamina bar stayed hidden below a full tank');
    // idle regen (player isn't sprinting) creeps stamina back up a little
    // during the wait above, so a tolerance band, not an exact %, is correct
    const w = parseFloat(await t.ev("document.getElementById('hud-stamina-fill').style.width"));
    t.near(w, 60, 6, 'fill width did not reflect stamina');
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('HUD stamina bar never overlaps the mode line at high UI scale (while visible)', async () => {
    await t.tp(austin.x - 300, austin.z - 40, 'WALK');
    await t.ev('(g.player.stamina = 0.5)'); // force the bar visible
    await t.wait(0.15);
    // stamina sits ABOVE the mode line (bottom: 10.4rem vs 8.2rem), so no
    // overlap means stamina's bottom edge stays above mode's top edge
    const rects = () => t.ev(`({
      stamina: document.getElementById('hud-stamina').getBoundingClientRect().bottom,
      mode: document.getElementById('hud-mode').getBoundingClientRect().top,
    })`);
    const base = await rects();
    t.ok(base.stamina <= base.mode, `overlap at 100%: stamina.bottom ${base.stamina.toFixed(0)} vs mode.top ${base.mode.toFixed(0)}`);
    for (let i = 0; i < 10; i++) {
      await t.key('Equal');
      const r = await rects();
      t.ok(r.stamina <= r.mode, `overlap at step ${i + 1}: stamina.bottom ${r.stamina.toFixed(0)} vs mode.top ${r.mode.toFixed(0)}`);
    }
    for (let i = 0; i < 10; i++) await t.key('Minus'); // restore baseline for later checks
    await t.ev(`g.player.setMode('DRIVE')`);
  });

  await t.check('+/- steps the UI scale, resizes HUD text, persists', async () => {
    const px = () => t.ev(`({
      root: parseFloat(getComputedStyle(document.documentElement).fontSize),
      hud: parseFloat(getComputedStyle(document.getElementById('hud-topleft')).fontSize),
      map: parseFloat(getComputedStyle(document.getElementById('minimap')).width),
      pref: localStorage['lonestar-ui-scale'] ?? null,
    })`);
    const base = await px();
    await t.key('Equal');
    const up = await px();
    await t.key('Minus');
    const back = await px();
    t.near(up.root, base.root * 1.1, 0.1, 'root font did not step up 10%');
    t.near(up.hud, base.hud * 1.1, 0.3, 'HUD text did not follow the root scale');
    t.near(up.map, base.map * 1.1, 0.5, 'minimap CSS size did not follow');
    t.ok(up.pref === '1.1', `pref not persisted: ${up.pref}`);
    t.near(back.root, base.root, 0.1, 'minus did not step back down');
    t.ok(back.pref === '1', `pref after minus: ${back.pref}`);
  });

  await t.check('H shows help; money appears once hauling starts', async () => {
    await t.key('KeyH');
    const { disp, stats, jobsDone } = await t.ev(
      `({ disp: g.hud.els.help.style.display, stats: document.getElementById('help-stats').textContent, jobsDone: g.gameplay.save.jobsDone })`);
    await t.key('KeyH');
    t.ok(disp === 'block', 'help not shown');
    t.ok(stats.includes('traveled'), `no base stats: "${stats}"`);
    // the 💵 segment is gated on jobsDone > 0 by design
    t.ok(stats.includes('$') === jobsDone > 0, `money/jobsDone mismatch (jobsDone ${jobsDone}): "${stats}"`);
  });

  // Esc pauses: real-loop sentinel — player.simT (Σ dt inside player.update, which
  // the main loop skips while paused) must freeze over wall time, then resume.
  await t.check('Esc pause freezes the world loop, resume restarts it', async () => {
    await t.tp(austin.x, austin.z); // somewhere off-road; nothing else open
    await t.key('Escape'); // pause
    const paused = await t.ev(
      `({ on: g.isPaused(), disp: g.hud.els.paused.style.display })`);
    t.ok(paused.on === true, 'isPaused() false after Esc');
    t.ok(paused.disp === 'flex', `PAUSED overlay not shown: "${paused.disp}"`);
    // frozen: simT must not advance across real frames
    const frozenBefore = await t.ev('g.player.simT');
    await t.wait(1.5);
    const frozenAfter = await t.ev('g.player.simT');
    t.near(frozenAfter, frozenBefore, 0.02, `simT advanced ${(frozenAfter - frozenBefore).toFixed(3)} while paused`);
    // keys are swallowed while paused: V (cycle mode) must be a no-op
    const modeBefore = await t.ev('g.player.mode');
    await t.key('KeyV');
    t.ok((await t.ev('g.player.mode')) === modeBefore, 'KeyV changed mode while paused');
    // resume: simT ticks again, overlay hides
    await t.key('Escape');
    const runBefore = await t.ev('g.player.simT');
    await t.wait(1.5);
    const runAfter = await t.ev('g.player.simT');
    t.ok(runAfter - runBefore > 0.1, `loop still frozen after resume (Δ ${(runAfter - runBefore).toFixed(3)})`);
    t.ok((await t.ev('g.isPaused()')) === false, 'still paused after second Esc');
    t.ok((await t.ev('g.hud.els.paused.style.display')) === 'none', 'PAUSED overlay still visible after resume');
  });

  // Esc is context-aware: an open menu is dismissed first, pause only when clear.
  await t.check('Esc closes an open menu before it pauses', async () => {
    await t.key('KeyP'); // open travel menu
    t.ok((await t.ev(`g.travel.el.style.display`)) === 'flex', 'travel menu did not open');
    await t.key('Escape'); // should close the menu, NOT pause
    t.ok((await t.ev(`g.travel.el.style.display`)) === 'none', 'Esc did not close the travel menu');
    t.ok((await t.ev('g.isPaused()')) === false, 'Esc paused instead of just closing the menu');
  });

  // nature hint (crop/wildlife readout) — known Hale cotton field centroid,
  // frozen coords shared with ag.mjs's placement-frozen check.
  const haleFieldX = -2147.5011160714284, haleFieldZ = -3607.7045340401787;

  await t.check('nature hint: shows crop name over a known field, hides on the clean I-10 stretch', async () => {
    await t.tp(haleFieldX, haleFieldZ, 'WALK');
    await t.wait(0.2);
    const near = await t.ev('g.hud.els.crop.textContent');
    t.ok(near.includes('Cotton'), `crop hint wrong at the known Hale field: "${near}"`);
    t.ok((await t.ev('g.hud.els.crop.style.display')) === 'block', 'crop hint not visible over the field');
    await t.tp(-2767, 334, 'WALK'); // clean I-10 stretch — no fields, no wildlife
    await t.wait(0.2);
    t.ok((await t.ev('g.hud.els.crop.style.display')) === 'none', 'crop hint still visible on the clean stretch');
  });

  await t.check('nature hint: both slots suppressed in FLY mode even over a known field', async () => {
    await t.tp(haleFieldX, haleFieldZ, 'FLY');
    await t.wait(0.2);
    const r = await t.ev('({ crop: g.hud.els.crop.style.display, wild: g.hud.els.wildlife.style.display })');
    t.ok(r.crop === 'none' && r.wild === 'none',
      `nature slots visible while flying over the field (crop ${r.crop}, wildlife ${r.wild})`);
  });

  // The real-loop sentinel for the pair: main.js must feed both slots every frame,
  // and neither may suppress the other (wildlife used to win outright).
  await t.check('nature hint: crop and wildlife hold their own slots — neither suppresses the other', async () => {
    await t.tp(haleFieldX, haleFieldZ, 'WALK');
    await t.wait(0.2);
    t.ok((await t.ev('g.hud.els.crop.textContent')).includes('Cotton'), 'crop hint not showing before the wildlife stub');
    // stub a wildlife hit while standing on the field, without a real nearby animal
    await t.ev(`(window.__origAnimalsUpdate = g.animals.update.bind(g.animals),
      g.animals.update = () => {}, g.animals.nearby = { species: 'deer', d2: 4 })`);
    await t.wait(0.2);
    const r = await t.ev(`({ crop: g.hud.els.crop.textContent, cropShown: g.hud.els.crop.style.display,
      wild: g.hud.els.wildlife.textContent, wildShown: g.hud.els.wildlife.style.display })`);
    t.ok(r.crop.includes('Cotton') && r.cropShown === 'block',
      `wildlife suppressed the crop slot: "${r.crop}" (${r.cropShown})`);
    t.ok(r.wild.includes('White-tailed Deer') && r.wildShown === 'block',
      `wildlife slot missing while standing on a field: "${r.wild}" (${r.wildShown})`);
    await t.ev('g.animals.update = window.__origAnimalsUpdate'); // restore the real wiring
    await t.tp(haleFieldX, haleFieldZ, 'DRIVE'); // leave the suite grounded in DRIVE
  });

  // Slot mechanics, driven directly: the main loop rewrites both slots every frame
  // from world state, so the sequence runs inside one synchronous block where no
  // frame can interleave. The check above is what guards the real-loop wiring.
  await t.check('nature slots: arrival order fixes Y, a rewrite holds its place, the survivor slides up', async () => {
    const r = await t.ev(`(() => {
      const box = g.hud.els.natureBox;
      const order = () => [...box.children].filter((el) => el.style.display === 'block').map((el) => el.id);
      g.hud.natureHint(null, null);
      g.hud.natureHint(null, '🐾 Coyote');           // wildlife arrives alone
      const a = order();
      g.hud.natureHint('🌾 Cotton', '🐾 Coyote');    // crop arrives second — takes the lower slot
      const b = order();
      g.hud.natureHint('🌾 Sorghum', '🐾 Coyote');   // crop replaces its own text — must not move
      const c = order(), cropText = g.hud.els.crop.textContent; // read before (e) rewrites it back
      g.hud.natureHint(null, '🐾 Coyote');           // crop leaves; the survivor slides up
      const d = order();
      g.hud.natureHint(null, null);
      g.hud.natureHint('🌾 Cotton', null);           // reverse arrival: crop is up first this time
      g.hud.natureHint('🌾 Cotton', '🐾 Coyote');    // wildlife arrives second
      const e = order();
      return { a, b, c, d, e, cropText };
    })()`);
    const seq = (v) => JSON.stringify(v);
    t.ok(seq(r.a) === '["hud-wildlife"]', `wildlife alone should hold one slot: ${seq(r.a)}`);
    t.ok(seq(r.b) === '["hud-wildlife","hud-crop"]', `crop should arrive below the wildlife already up: ${seq(r.b)}`);
    t.ok(seq(r.c) === '["hud-wildlife","hud-crop"]', `a crop rewrite moved the row: ${seq(r.c)}`);
    t.ok(r.cropText.includes('Sorghum'), `crop slot didn't take the replacement text: "${r.cropText}"`);
    t.ok(seq(r.d) === '["hud-wildlife"]', `survivor didn't hold the panel alone after the crop left: ${seq(r.d)}`);
    t.ok(seq(r.e) === '["hud-crop","hud-wildlife"]', `reverse arrival order not honored: ${seq(r.e)}`);
  });
}
