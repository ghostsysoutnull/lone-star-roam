// West Texas massifs W1 — the Guadalupe wall: hero ridge tents draped on the
// real DEM (world.js GUADALUPE_SPINE), the Guadalupe Peak summit landmark,
// and the mesh-free saddle that keeps the marker walkable.

export default async function massif(t) {
  await t.check('spine tents exist, sit on terrain, and stay off the highway', async () => {
    const res = await t.ev(`(() => {
      const mesh = g.scenery.massif;
      if (!mesh) return { missing: true };
      const spine = mesh.userData.spine;
      const bad = [];
      for (const a of spine) {
        const ground = g.hAt(a.x, a.z);
        // apex must rise well above local DEM (that's the whole point);
        // 0.5h not h because the base sinks to the footprint's lowest sample
        if (a.apexY - ground < a.h * 0.5) bad.push('low apex at ' + a.x.toFixed(0) + ',' + a.z.toFixed(0));
        // center must not sit under a road ribbon (US 62/180 threads the pass;
        // check both networks — the reef arm ends in band territory)
        const rt = g.nearestRoad(a.x, a.z), rb = g.nearestBandRoad(a.x, a.z);
        const rd = Math.min(rt ? rt.dist : Infinity, rb ? rb.dist : Infinity);
        if (rd < 6) bad.push('road ' + rd.toFixed(1) + 'u from tent at ' + a.x.toFixed(0) + ',' + a.z.toFixed(0));
      }
      // satellite knobs obey the same road law (their build already skips
      // road-near sites — this pins the law, not the survivors' count)
      for (const a of mesh.userData.knobs) {
        const rt = g.nearestRoad(a.x, a.z), rb = g.nearestBandRoad(a.x, a.z);
        const rd = Math.min(rt ? rt.dist : Infinity, rb ? rb.dist : Infinity);
        if (rd < 4) bad.push('road ' + rd.toFixed(1) + 'u from knob at ' + a.x.toFixed(0) + ',' + a.z.toFixed(0));
      }
      const verts = mesh.geometry.attributes.position.count;
      return { missing: false, verts, n: spine.length, nk: mesh.userData.knobs.length, bad };
    })()`);
    t.ok(!res.missing, 'scenery.massif is missing — buildGuadalupes did not run');
    t.ok(res.n === 14, `expected 14 spine tents, got ${res.n}`);
    t.ok(res.nk >= 20, `only ${res.nk} satellite knobs survived legality — silhouette too sparse`);
    t.ok(res.verts >= 2800, `merged massif has only ${res.verts} vertices — craggy geometry regressed`);
    t.ok(res.bad.length === 0, `spine defects: ${res.bad.join('; ')}`);
  });

  await t.check('every tent base sits under terrain around its whole footprint ring', async () => {
    const res = await t.ev(`(() => {
      const md = g.scenery.massif.userData;
      const bad = [];
      for (const a of md.spine.concat(md.knobs)) {
        for (let k = 0; k < 12; k++) {
          const ang = (k / 12) * Math.PI * 2;
          const lx = Math.cos(ang) * a.w, lz = Math.sin(ang) * a.len;
          const rx = a.x + lx * Math.cos(a.yaw) + lz * Math.sin(a.yaw);
          const rz = a.z - lx * Math.sin(a.yaw) + lz * Math.cos(a.yaw);
          if (a.baseY > g.hAt(rx, rz) + 0.01) {
            bad.push('floating skirt at ' + rx.toFixed(0) + ',' + rz.toFixed(0));
            break;
          }
        }
      }
      return bad;
    })()`);
    t.ok(res.length === 0, `tents off the ground: ${res.join('; ')}`);
  });

  await t.check('no historical marker floats: every landmark plaque drapes to its own ground', async () => {
    const res = await t.ev(`(() => {
      const bad = [];
      for (const c of g.gameplay.landmarkGroup.children) {
        const post = c.userData.lm && c.userData.marker ? c.userData.marker[0] : null;
        if (!post) { bad.push((c.userData.lm?.name || '?') + ': no marker ref'); continue; }
        const postBase = c.position.y + post.position.y - 0.65;
        const groundAt = g.hAt(c.position.x + 5.5, c.position.z + 5.5);
        if (Math.abs(postBase - groundAt) > 0.3) bad.push(c.userData.lm.name + ' off by ' + (postBase - groundAt).toFixed(2));
      }
      return bad;
    })()`);
    t.ok(res.length === 0, `floating markers: ${res.join('; ')}`);
  });

  await t.check('the range crosses the state line: NM tents on real NM ground', async () => {
    const res = await t.ev(`(() => {
      const spine = g.scenery.massif.userData.spine;
      let nm = 0, tx = 0;
      for (const a of spine) {
        const s = g.neighborStateAt(a.x, a.z);
        if (s === 'NM') nm++;
        else if (g.inTexas(a.x, a.z)) tx++;
      }
      return { nm, tx, total: spine.length };
    })()`);
    t.ok(res.nm >= 4, `expected >=4 NM-side tents, got ${res.nm}`);
    t.ok(res.tx >= 7, `expected >=7 Texas-side tents, got ${res.tx}`);
    t.ok(res.nm + res.tx === res.total, `${res.total - res.nm - res.tx} tents on neither Texas nor NM ground`);
  });

  await t.check('summit saddle is mesh-free: marker site clear of every tent footprint', async () => {
    const res = await t.ev(`(() => {
      const lm = g.LANDMARKS.find((l) => l.name === 'Guadalupe Peak');
      if (!lm) return { missing: true };
      const [mx, mz] = lm.at;
      const md = g.scenery.massif.userData;
      let worst = Infinity;
      for (const a of md.spine.concat(md.knobs)) {
        // conservative footprint: half the larger base axis
        const foot = Math.max(a.len, a.w) / 2;
        const d = Math.hypot(a.x - mx, a.z - mz) - foot;
        worst = Math.min(worst, d);
      }
      return { missing: false, worst };
    })()`);
    t.ok(!res.missing, 'Guadalupe Peak landmark is not in LANDMARKS');
    t.ok(res.worst > 1.5, `a tent footprint reaches within ${res.worst?.toFixed(1)}u of the summit marker`);
  });

  await t.check('summit landmark collects on foot at a natural parked distance', async () => {
    const res0 = await t.ev(`(() => {
      const lm = g.LANDMARKS.find((l) => l.name === 'Guadalupe Peak');
      const i = g.gameplay.save.landmarks.indexOf('Guadalupe Peak');
      if (i >= 0) g.gameplay.save.landmarks.splice(i, 1); // re-arm if a sibling suite collected it
      return { x: lm.at[0], z: lm.at[1] };
    })()`);
    // approach the marker the way a player lands: ~12u off, on the DEM surface
    await t.ev(`(() => { g.player.setMode('WALK'); g.player.pos.set(${res0.x} + 8, 0, ${res0.z} + 9); g.player.pos.y = g.hAt(g.player.pos.x, g.player.pos.z); })()`);
    await t.wait(0.6); // collection lives in gameplay.update (real loop)
    const res = await t.ev(`({
      got: g.gameplay.save.landmarks.includes('Guadalupe Peak'),
      agl: g.player.pos.y - g.hAt(g.player.pos.x, g.player.pos.z),
    })`);
    t.ok(res.got, `summit did not collect from ~12u on foot (agl ${res.agl?.toFixed(1)})`);
  });
}
