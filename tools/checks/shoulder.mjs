// Shoulder & Shelf, waves 6a+6b — The Shoulder east + ceremony + west:
// data-derived WELCOME TO TEXAS monuments at every real road crossing, the
// leaving murmur / homecoming chime, the seven Corner Stones (Passport
// stones), the Neutral Ground vignettes off I-10 (cypress, crawfish ponds,
// fireworks barns, plaque, frogs-over-crickets), Texarkana's straddle, the
// WinBig lot full of Texas plates, black bear in the Sabine pines (species
// 29), the beyond-band glows (E: Lake Charles/Natchitoches, W: Lawton/
// Alamogordo), and the 6b west vignettes: Texola ruins, Glenrio's two-faced
// motel sign, the Texhoma elevators, Anthony's leap-year banner, and the
// Carlsbad doorstep (park road + entrance sign, ZERO cave content).
//
// Ceremony transition checks run FIRST: they depend on the boot state of
// main.js's lastSide machine ('tx', spawn in Austin) before other checks
// teleport the player back and forth across the line.

export default async function shoulder(t) {
  await t.check('crossing ceremony: leaving murmurs, coming home chimes (+ seeded Miss us?)', async () => {
    // spy the chime — the homecoming is audio, not DOM
    await t.ev(`(() => {
      window.__chimes = [];
      window.__origChime = g.audio.chime.bind(g.audio);
      g.audio.chime = (k) => { window.__chimes.push(k); window.__origChime(k); };
    })()`);
    await t.tp(5195, -2699); // Bowie County, a few units west of the AR line
    await t.until(`!!g.countyAt(g.player.pos.x, g.player.pos.z)`, 3000); // 12 Hz tick settles lastSide = 'tx'
    await t.wait(0.2);
    await t.tp(5230, -2699); // Miller County, Arkansas — in the band
    await t.until(`g.hud.els.toast.textContent.includes('leaving Texas')`, 4000);
    const out = await t.ev(`({
      toast: g.hud.els.toast.textContent,
      stamped: g.gameplay.save.passport.stamps.includes('AR'),
    })`);
    t.ok(out.toast === "You're leaving Texas. It'll be here.",
      `leaving toast wrong (must fire after the county/stamp toasts): "${out.toast}"`);
    t.ok(out.stamped, 'AR passport stamp missing after the crossing');
    await t.wait(8.2);       // ceremony cooldown is 8 s of clock time
    await t.tp(5195, -2699); // back over the line
    await t.until(`window.__chimes.includes('texas')`, 4000);
    const back = await t.ev(`({
      chimes: window.__chimes,
      missusRoll: g.seededRand('missus:1')() < 0.3,
      toast: g.hud.els.toast.textContent,
    })`);
    await t.ev(`(g.audio.chime = window.__origChime, 0)`); // restore the spy
    t.ok(back.chimes.includes('texas'), `homecoming chime never fired: [${back.chimes}]`);
    if (back.missusRoll) t.ok(back.toast === 'Miss us? 🤠', `missus roll hit but toast is "${back.toast}"`);
    else t.ok(back.toast !== 'Miss us? 🤠', 'missus toast fired against its seeded roll');
  });

  await t.check('welcome monuments: derived from real crossings, inside Texas, facing the line', async () => {
    const res = await t.ev(`(() => {
      const B = g.GEO.border;
      // SEGMENT distance, not vertex distance — the surveyed straight lines
      // (103°W, the Panhandle edges) run 1000+ units between vertices
      const sDist = (x, z) => {
        let best = Infinity;
        for (let i = 0; i < B.length; i++) {
          const [ax, az] = B[i], [bx, bz] = B[(i + 1) % B.length];
          const dx = bx - ax, dz = bz - az;
          const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
          best = Math.min(best, Math.hypot(x - ax - dx * tt, z - az - dz * tt));
        }
        return best;
      };
      const sites = g.shoulder.monuments;
      return {
        n: sites.length,
        refs: [...new Set(sites.map((s) => s.ref))].sort(),
        allInTexas: sites.every((s) => g.inTexas(s.x, s.z)),
        maxBorderDist: Math.max(...sites.map((s) => sDist(s.x, s.z))),
        // the far side of every crossing must be a US neighbor — a monument
        // facing Juárez would mean the Rio Grande stretch leaked through
        badNeighbor: sites.filter((s) => !g.neighborCountyAt(s.x + s.ox * 30, s.z + s.oz * 30)).map((s) => s.ref),
      };
    })()`);
    t.ok(res.n >= 10 && res.n <= 15, `expected ~12 crossing monuments, got ${res.n}`);
    for (const ref of ['I 10', 'I 20', 'I 30', 'I 35', 'I 40'])
      t.ok(res.refs.includes(ref), `no monument at the ${ref} crossing (refs: ${res.refs})`);
    t.ok(res.allInTexas, 'a welcome monument stands outside Texas');
    t.ok(res.maxBorderDist < 25, `a monument strayed ${res.maxBorderDist.toFixed(1)}u from the line`);
    t.ok(res.badNeighbor.length === 0, `monument(s) not facing a US neighbor: ${res.badNeighbor}`);
  });

  await t.check('Corner Stones: seven, ON the line, stamping the Passport once each', async () => {
    const res = await t.ev(`(() => {
      const B = g.GEO.border;
      const vDist = (x, z) => {
        let best = Infinity;
        for (const [vx, vz] of B) best = Math.min(best, Math.hypot(vx - x, vz - z));
        return best;
      };
      const s = g.shoulder.stones;
      return { n: s.length, keys: s.map((x) => x.key), maxSnap: Math.max(...s.map((x) => vDist(x.x, x.z))) };
    })()`);
    t.ok(res.n === 7, `expected 7 Corner Stones, got ${res.n}`);
    t.ok(res.maxSnap < 0.01, `a stone missed the border polygon by ${res.maxSnap.toFixed(2)}u`);
    // park a truck-length off the NE Panhandle corner — natural distance, not 0
    const ne = await t.ev(`g.shoulder.stones.find((s) => s.key === 'ne')`);
    await t.tp(ne.x + 6, ne.z + 4);
    await t.until(`g.gameplay.save.passport.stones.includes('ne')`, 4000);
    const after = await t.ev(`({
      n: g.gameplay.save.passport.stones.length,
      dom: document.getElementById('score-pass-stones').textContent,
      plaque: g.shoulder.plaqueNear(g.player.pos, 28)?.name,
    })`);
    t.ok(after.n === 1, `stones length ${after.n} after one stone`);
    t.ok(after.dom === '1', `HUD stones counter reads "${after.dom}"`);
    t.ok(after.plaque === 'Corner Stone — Panhandle NE Corner', `stone plaque not readable: ${after.plaque}`);
    await t.wait(1.2); // proximity rescan — dedup must hold
    const dedup = await t.ev('g.gameplay.save.passport.stones.length');
    t.ok(dedup === 1, `stone stamped twice (${dedup})`);
  });

  await t.check('Neutral Ground: plaque copy, cypress on the far bank, ponds, road anchor', async () => {
    const at = await t.ev('g.shoulder.ngPlaqueAt');
    await t.tp(at[0] + 8, at[1] + 6); // parked distance
    await t.until(`g.hud.els.interact.textContent.includes('Neutral Ground')`, 4000);
    const hint = await t.ev('g.hud.els.interact.textContent');
    t.ok(hint === 'E — read the Neutral Ground marker', `expected the marker hint, got "${hint}"`);
    await t.key('KeyE');
    const dlg = await t.ev(`({
      name: g.hud.els.dialog.querySelector('.npc-name').textContent,
      text: g.hud.els.dialog.querySelector('.npc-text').textContent,
    })`);
    t.ok(dlg.name.includes('Neutral Ground'), `dialog name "${dlg.name}"`);
    t.ok(dlg.text.includes('belonged to nobody') && dlg.text.includes('Sabine'),
      `Neutral Ground copy drifted: "${dlg.text.slice(0, 50)}…"`);
    await t.key('KeyE');
    const res = await t.ev(`({
      stub: !!g.shoulder.ngStub,
      cypress: g.shoulder.cypress.count,
      ponds: g.shoulder.ponds,
      signs: g.shoulder.signs.length,
      cypressTexas: (() => { // trees must keep to the Louisiana bank
        const m = g.shoulder.cypress, v = new (m.matrixWorld.constructor)();
        let inTx = 0;
        for (let i = 0; i < m.count; i += 3) {
          m.getMatrixAt(i, v);
          if (g.inTexas(v.elements[12], v.elements[14])) inTx++;
        }
        return inTx;
      })(),
    })`);
    t.ok(res.stub, 'I-10 east stub not found — Neutral Ground lost its road anchor');
    t.ok(res.cypress > 20, `cypress row too thin: ${res.cypress} trees`);
    t.ok(res.cypressTexas === 0, `${res.cypressTexas} cypresses sampled on the Texas bank (ScenerySystem's side)`);
    t.ok(res.ponds === 3, `crawfish ponds: ${res.ponds}`);
    t.ok(res.signs === 4, `control-city signs: ${res.signs} (E: Lake Charles/NO + Natchitoches; W: Tucumcari/Abq + Deming/Tucson)`);
  });

  await t.check('frogs-over-crickets: swamp factor feeds the night mix out there only', async () => {
    await t.setWeather('clear');
    await t.setNight();
    await t.tp(5644.9, 907.1); // Vinton — deep frog country
    await t.until('g.audio.swamp > 0.9', 4000); // audio.swamp rides the 12 Hz tick
    const vinton = await t.ev('({ swamp: g.audio.swamp, frog: g.audio.frogTarget, cricket: g.audio.cricketTarget })');
    t.ok(vinton.swamp > 0.9, `swampAt(Vinton) = ${vinton.swamp}`);
    t.ok(vinton.frog > vinton.cricket * 3,
      `frogs must dominate the swamp at night: frog ${vinton.frog.toFixed(4)} vs cricket ${vinton.cricket.toFixed(4)}`);
    await t.tp(830.2, 847.1);  // LBJ ranch — Hill Country crickets
    await t.until('g.audio.swamp === 0', 4000);
    const austin = await t.ev('({ swamp: g.audio.swamp, frog: g.audio.frogTarget, cricket: g.audio.cricketTarget })');
    t.ok(austin.swamp === 0, `swampAt(Hill Country) = ${austin.swamp}`);
    t.ok(austin.frog === 0 && austin.cricket > 0, 'crickets must own an ordinary Texas night');
  });

  await t.check('Texarkana: the straddle toast, the two-state building, downtown standoff', async () => {
    const res = await t.ev(`({
      straddle: g.shoulder.straddle,
      clearFed: g.shoulderClear(g.shoulder.straddle[0], g.shoulder.straddle[1] - 10),
      clearAustin: g.shoulderClear(830, 847),
    })`);
    t.ok(!res.clearFed, 'shoulderClear must reject the federal-building footprint');
    t.ok(res.clearAustin, 'shoulderClear rejecting far-away points');
    await t.tp(res.straddle[0] + 1, res.straddle[1] + 1); // a step off the brass line
    await t.until(`g.hud.els.toast.textContent.includes('One boot')`, 4000);
    const plq = await t.ev(`g.shoulder.plaqueNear(g.player.pos, 28)?.name`);
    t.ok(plq === 'The Straddle Spot', `straddle plaque not readable: ${plq}`);
  });

  await t.check('WinBig World: exterior + lot only, every plate reads Texas', async () => {
    const res = await t.ev(`(() => {
      const c = g.shoulder.casino;
      let cars = null, plates = null;
      c.traverse((o) => {
        if (o.isInstancedMesh && o.userData.plates) plates = o;
        else if (o.isInstancedMesh) cars = o;
      });
      return {
        kind: c.userData.kind, cars: cars?.count, plates: plates?.count,
        joke: plates?.userData.plates,
        inTexas: g.inTexas(c.children[1].position.x, c.children[1].position.z),
      };
    })()`);
    t.ok(res.kind === 'winbig', 'casino group missing');
    t.ok(res.cars === 36 && res.plates === 36, `lot: ${res.cars} cars / ${res.plates} plates`);
    t.ok(res.joke === 'TEXAS', 'the plates must be the joke');
    t.ok(!res.inTexas, 'WinBig belongs across the Red River, not in Texas');
    const plaque = await t.ev(`g.shoulder.plaques.find((p) => p.name.includes('WinBig'))`);
    t.ok(plaque.text.includes('Texas, Texas, Texas'), 'marquee copy lost the plates gag');
  });

  await t.check('beyond-band glow east + west: dark by day, lit at night, fog-proof', async () => {
    await t.setDay();
    await t.until('g.shoulder.glowMat.opacity < 0.05', 4000); // rides the real loop
    const day = await t.ev('g.shoulder.glowMat.opacity');
    t.ok(day < 0.05, `horizon glow lit in daylight: ${day}`);
    await t.setNight();
    await t.until('g.shoulder.glowMat.opacity > 0.1', 4000);
    const night = await t.ev('({ o: g.shoulder.glowMat.opacity, fog: g.shoulder.glowMat.fog, n: g.shoulder.glows.length })');
    t.ok(night.o > 0.1, `glow dark at night: ${night.o}`);
    t.ok(night.fog === false, 'glow must ignore scene fog (rigGlow law)');
    t.ok(night.n === 4, `expected Lake Charles + Natchitoches + Lawton + Alamogordo glows, got ${night.n}`);
    await t.setDay(); // leave the sky as found
  });

  await t.check('black bear: 29th species, Sabine strip only, and it actually runs away', async () => {
    const table = await t.ev(`({
      total: Object.keys(g.SPECIES).length,
      dom: document.getElementById('total-critters').textContent,
      sabine: g.animals.regionTable(4700, -800).some((r) => r[0] === 'blackbear'),
      west: g.animals.regionTable(3600, -800).some((r) => r[0] === 'blackbear'),
      coast: g.animals.regionTable(4700, 900).some((r) => r[0] === 'blackbear'),
    })`);
    t.ok(table.total === 29 && table.dom === '29', `species ${table.total}, DOM ${table.dom}`);
    t.ok(table.sabine, 'no bear row in the Sabine strip table');
    t.ok(!table.west && !table.coast, 'bear escaped the Sabine strip (western pines / coast tables)');
    // hunt a live one — seeded chunks, so whichever spot works keeps working
    let bear = null;
    for (const [x, z] of [[4700, -800], [4550, -1500], [4850, -300], [4600, 100], [4950, -1100], [4500, -2000]]) {
      await t.tp(x, z);
      await t.wait(1.2); // chunk spawn
      bear = await t.ev(`(() => {
        for (const c of g.animals.live.values())
          for (const a of c.animals) if (a.species === 'blackbear')
            return { x: a.g.position.x, z: a.g.position.z };
        return null;
      })()`);
      if (bear) break;
    }
    t.ok(bear, 'no bear found across six Sabine-strip spots (keep 0.12 — is the row live?)');
    if (!bear) return;
    await t.tp(bear.x + 10, bear.z); // inside fleeR 26
    const d0 = await t.ev(`(() => {
      for (const c of g.animals.live.values())
        for (const a of c.animals) if (a.species === 'blackbear')
          return Math.hypot(a.g.position.x - g.player.pos.x, a.g.position.z - g.player.pos.z);
    })()`);
    await t.wait(1.6); // flee is distance-over-time, not a screenshot (deer lesson)
    const d1 = await t.ev(`(() => {
      for (const c of g.animals.live.values())
        for (const a of c.animals) if (a.species === 'blackbear')
          return Math.hypot(a.g.position.x - g.player.pos.x, a.g.position.z - g.player.pos.z);
    })()`);
    t.ok(d1 > d0 + 3, `bear not fleeing a parked truck: ${d0?.toFixed(1)} → ${d1?.toFixed(1)}u`);
    await t.until(`g.gameplay.save.species.includes('blackbear')`, 6000);
  });

  await t.check('Texola: pop. 42 — roofless shells hold the line, the wall gets the last word', async () => {
    const res = await t.ev(`({
      walls: g.shoulder.texolaWalls,
      at: g.shoulder.texolaAt,
      inTx: g.inTexas(g.shoulder.texolaAt[0], g.shoulder.texolaAt[1]),
      clear: g.shoulderClear(g.shoulder.texolaAt[0], g.shoulder.texolaAt[1] - 6),
      plaques: g.shoulder.plaques.length,
    })`);
    t.ok(res.walls >= 18, `ruin walls too few: ${res.walls}`);
    t.ok(!res.inTx, 'Texola stands in Oklahoma, not Texas');
    t.ok(!res.clear, 'shoulderClear must reject the Texola ruins footprint');
    t.ok(res.plaques === 15, `expected 15 shoulder plaques after the west five, got ${res.plaques}`);
    // park at the wall like a person — natural distance, off-axis
    await t.tp(res.at[0] + 5, res.at[1] + 4);
    await t.until(`g.hud.els.interact.textContent.includes('wall')`, 4000);
    await t.key('KeyE');
    const dlg = await t.ev(`g.hud.els.dialog.querySelector('.npc-text').textContent`);
    t.ok(dlg.includes('must be the place'), `Texola copy lost the last word: "${dlg.slice(0, 60)}…"`);
    await t.key('KeyE');
  });

  await t.check('Glenrio: one sign, two truths — FIRST greets the arrival, LAST waves goodbye', async () => {
    const res = await t.ev(`(() => {
      const s = g.shoulder.glenrioSign;
      return {
        faces: s.children.filter((c) => c.userData.reads).map((c) => ({ reads: c.userData.reads, yaw: c.rotation.y })),
        at: g.shoulder.glenrioAt,
        inTx: g.inTexas(s.position.x, s.position.z),
        nmSide: g.inTexas(s.position.x - 15, s.position.z),
      };
    })()`);
    t.ok(res.faces.length === 2, `sign faces: ${res.faces.length}`);
    const first = res.faces.find((f) => f.reads.startsWith('FIRST'));
    const last = res.faces.find((f) => f.reads.startsWith('LAST'));
    t.ok(first && Math.abs(first.yaw + Math.PI / 2) < 0.01, 'FIRST face must look west at the arriving driver');
    t.ok(last && Math.abs(last.yaw - Math.PI / 2) < 0.01, 'LAST face must look east at the leaving driver');
    t.ok(res.inTx, 'the motel sign stands in Texas');
    t.ok(!res.nmSide, '15u west of the sign must already be New Mexico — Glenrio hugs the line');
    await t.tp(res.at[0] + 6, res.at[1] + 4); // parked by the office, off-axis
    await t.until(`g.hud.els.interact.textContent.includes('motel sign')`, 4000);
    await t.key('KeyE');
    const dlg = await t.ev(`g.hud.els.dialog.querySelector('.npc-text').textContent`);
    t.ok(dlg.includes('FIRST') && dlg.includes('LAST') && dlg.includes('1973'),
      `Glenrio copy drifted: "${dlg.slice(0, 60)}…"`);
    await t.key('KeyE');
  });

  await t.check('Texhoma & Anthony: elevators take both states, the banner sags over the line', async () => {
    const res = await t.ev(`(() => {
      const tx = g.shoulder.texhomaAt, an = g.shoulder.anthonyAt;
      const b = g.shoulder.anthonyBanner[0];
      const pos = b.geometry.attributes.position;
      let midY = Infinity, endY = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getX(i)) < 0.2) midY = Math.min(midY, pos.getY(i));
        if (Math.abs(pos.getX(i)) > 2.4) endY = Math.max(endY, pos.getY(i));
      }
      return {
        silos: g.shoulder.texhomaSilos,
        silosOK: !g.inTexas(tx[0], tx[1] - 5),
        texSouth: g.inTexas(tx[0], tx[1] + 3) && g.inTexas(an[0], an[1] + 3),
        okNorth: !g.inTexas(tx[0], tx[1] - 3) && !g.inTexas(an[0], an[1] - 3),
        clearTx: g.shoulderClear(tx[0], tx[1] - 5),
        clearAn: g.shoulderClear(an[0], an[1]),
        banners: g.shoulder.anthonyBanner.length,
        sag: endY - midY,
        clearance: b.position.y - g.hAt(an[0], an[1]),
        texPlq: g.shoulder.plaqueNear({ x: tx[0] + 4, z: tx[1] + 3 }, 28)?.name,
        anPlq: g.shoulder.plaqueNear({ x: an[0] + 4, z: an[1] - 3 }, 28)?.name,
        leapCopy: g.shoulder.plaques.find((p) => p.name === 'Anthony')?.text.includes('February 29'),
        schoolCopy: g.shoulder.plaques.find((p) => p.name === 'Texhoma')?.text.includes('school district'),
      };
    })()`);
    t.ok(res.silos === 9, `Texhoma silos: ${res.silos}`);
    t.ok(res.silosOK, 'the elevators stand on the Oklahoma side');
    t.ok(res.texSouth && res.okNorth, 'both vignettes must straddle their surveyed parallels');
    t.ok(!res.clearTx && !res.clearAn, 'shoulderClear must reject both footprints');
    t.ok(res.banners === 2, `banner needs a front face per direction: ${res.banners}`);
    t.ok(res.sag > 0.2, `the banner must sag on its catenary: ${res.sag?.toFixed(3)}`);
    t.ok(res.clearance > 3.2, `banner clearance over Main St: ${res.clearance?.toFixed(2)}u`);
    t.ok(res.texPlq === 'Texhoma' && res.anPlq === 'Anthony',
      `plaques not readable at parked distance: ${res.texPlq} / ${res.anPlq}`);
    t.ok(res.leapCopy && res.schoolCopy, 'plaque copy lost February 29 or the school district');
  });

  await t.check('the Carlsbad doorstep: the road climbs away from US 62, the door stays shut', async () => {
    const res = await t.ev(`(() => {
      const legs = g.shoulder.parkRoad;
      const top = g.shoulder.doorstepTop, at = g.shoulder.doorstepAt;
      const lp = legs[4].geometry.attributes.position; // world-space verts — a mid-switchback point
      let cave = 0;
      g.shoulder.group.traverse((o) => { if (/cave/i.test(o.name)) cave++; });
      return {
        legs: legs.length,
        climb: g.hAt(top[0], top[1]) - g.hAt(at[0], at[1]),
        midRoad: g.nearestRoad(lp.getX(0), lp.getZ(0), 30),
        clear: g.shoulderClear(at[0] + 9, at[1] + 3),
        cave,
        inTx: g.inTexas(at[0], at[1]),
        sign: !!g.shoulder.doorstepSign,
      };
    })()`);
    t.ok(res.legs === 7, `switchback legs: ${res.legs}`);
    t.ok(res.climb > 0.4, `the park road must climb the reef: ${res.climb?.toFixed(2)}u`);
    t.ok(!res.midRoad, `mid-switchback point sits on the road grid (causeway law): ${JSON.stringify(res.midRoad)}`);
    t.ok(!res.clear, 'shoulderClear must reject the Whites City strip');
    t.ok(res.cave === 0, 'ZERO cave content — the caves track inherits a place, not a promise');
    t.ok(!res.inTx, 'Whites City is New Mexico');
    t.ok(res.sign, 'the entrance sign is missing');
    // the plaque at the sign, parked
    const at = await t.ev('g.shoulder.doorstepAt');
    await t.tp(at[0] + 4, at[1] + 4);
    await t.until(`g.hud.els.interact.textContent.includes('park sign')`, 4000);
    const plq = await t.ev(`g.shoulder.plaqueNear(g.player.pos, 28)?.name`);
    t.ok(plq === 'The Carlsbad Doorstep', `doorstep plaque not readable: ${plq}`);
  });
}
