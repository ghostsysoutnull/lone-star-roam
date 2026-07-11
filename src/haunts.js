// Haunted Texas: night legends around the country chapels and cemeteries
// scattered through ranch country (world.js chapelAt), plus the ghost fires
// the Tonkawa people saw on Enchanted Rock. Everything here is campfire-
// spooky, never hostile: lights that drift, fade when approached, and vanish
// at dawn. A cemetery is haunted on ~half its nights (seeded per site+day, so
// a haunted graveyard stays haunted all night and every player sees the same
// night the same way). The nearest chapel also tolls its bell at midnight.
import * as THREE from 'three';
import { seededRand, hAt } from './geo.js';
import { ATMOS } from './sky.js';
import { chapelSitesNear } from './world.js';

const LL = (lat, lon) => [(lon + 99.5) * 111320 * Math.cos((31 * Math.PI) / 180) / 100, -(lat - 31) * 111320 / 100];
const EROCK = LL(30.5064, -98.8198); // Enchanted Rock — the landmark's granite dome

// the legends log — gameplay counts these as the 9th collectible category
export const LEGENDS = {
  wisps: { name: 'Cemetery Lights', fact: 'Ghost candles, the old folks called them — pale lights drifting over lonely Texas graves. They dim if you walk out to look.' },
  ghostfires: { name: 'Ghost Fires of Enchanted Rock', fact: 'The Tonkawa saw spirit fires flicker on the dome at night — and heard the granite groan as it cooled in the dark. It still does both.' },
};
export const LEGEND_COUNT = Object.keys(LEGENDS).length;

const WISP_N = 10, FIRE_N = 5;
const WISP_ODDS = 0.5;      // fraction of nights a given cemetery is haunted
const NIGHT_MIN = 0.7;      // deep-night gate (dawn banishes below it)
const WISP_SHOW = 160;      // wisps animate within this range of the site
const FADE_NEAR = 10, FADE_FULL = 25; // approach fade: gone by 10, full past 25
const WATCH_R = 45, WATCH_T = 2.5;    // watch this close, this long → legend
const FIRE_SEE = 400, FIRE_LOG = 130; // ghost-fire draw / sighting radii
const BELL_R = 160;                   // hear the midnight bell this far out

export class HauntSystem {
  constructor(scene, onLegend, onBell) {
    this.scene = scene;
    this.onLegend = onLegend; // (key) → gameplay.spotLegend
    this.onBell = onBell;     // (dist) → audio.bell
    this.t = 0;
    this.scanT = 0;
    this.site = null;      // nearest chapel/cemetery site (from chapelSitesNear)
    this.siteKey = null;
    this.cemY = 0;
    this.haunted = false;  // tonight's roll for the current site
    this.watchT = 0;
    this.lastBell = 0;     // sim time of the last midnight toll (0 = never)
    this.prevSkyT = null;
    this.rockY = null;

    // wisps: one little instanced cloud of pale orbs, reused at every cemetery
    this.wispMat = new THREE.MeshBasicMaterial({ color: 0xbfffd8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.wisps = new THREE.InstancedMesh(new THREE.SphereGeometry(0.26, 6, 5), this.wispMat, WISP_N);
    this.wisps.visible = false;
    this.wisps.frustumCulled = false; // tiny count; matrices lag a frame behind visibility
    scene.add(this.wisps);
    const rand = seededRand('wisp-drift');
    this.jit = Array.from({ length: WISP_N }, () => [rand() * Math.PI * 2, 0.6 + rand() * 1.6, rand() * Math.PI * 2, 0.4 + rand() * 0.8]);

    // Enchanted Rock ghost fires: warmer, larger, fixed ring on the dome's shoulder
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    this.fires = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 6, 5), this.fireMat, FIRE_N);
    this.fires.visible = false;
    this.fires.frustumCulled = false;
    scene.add(this.fires);

    this.m4 = new THREE.Matrix4();
    this.p = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.q = new THREE.Quaternion();
  }

  update(dt, px, pz, skyT, days) {
    this.t += dt;
    const night = ATMOS.night;
    const nightRamp = Math.min(1, Math.max(0, (night - NIGHT_MIN) / 0.15));

    // rescan the nearest chapel site every couple seconds (chapelAt is pure — cheap)
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 2;
      let best = null, bd = Infinity;
      for (const s of chapelSitesNear(px, pz, 2)) {
        const d = Math.hypot(s.cemX - px, s.cemZ - pz);
        if (d < bd) { bd = d; best = s; }
      }
      this.site = best;
      if (best && best.key !== this.siteKey) {
        this.siteKey = best.key;
        this.cemY = hAt(best.cemX, best.cemZ);
        this.watchT = 0;
      }
      // tonight's haunting, rolled per site + game day
      this.haunted = !!best && seededRand(`wisp:${best.key}:${Math.floor(days)}`)() < WISP_ODDS;
    }

    // midnight bell: skyT wraps past 0 with a chapel in earshot
    if (this.prevSkyT != null && skyT < this.prevSkyT - 0.5 && this.site) {
      const d = Math.hypot(this.site.x - px, this.site.z - pz);
      if (d < BELL_R) { this.lastBell = this.t; this.onBell?.(d); }
    }
    this.prevSkyT = skyT;

    // --- cemetery wisps ---
    const site = this.site;
    const cemD = site ? Math.hypot(site.cemX - px, site.cemZ - pz) : Infinity;
    const wOn = this.haunted && nightRamp > 0 && cemD < WISP_SHOW;
    this.wisps.visible = wOn;
    if (wOn) {
      for (let i = 0; i < WISP_N; i++) {
        const [ph, r, ph2, spd] = this.jit[i];
        const a = ph + this.t * 0.14 * spd;
        this.p.set(
          site.cemX + Math.cos(a) * r * 1.5,
          this.cemY + 0.85 + r * 0.15 + Math.sin(this.t * 0.6 * spd + ph2) * 0.35,
          site.cemZ + Math.sin(a * 0.8 + ph2) * r * 1.2
        );
        const k = 0.8 + 0.25 * Math.sin(this.t * 2.2 * spd + ph);
        this.s.setScalar(k);
        this.m4.compose(this.p, this.q, this.s);
        this.wisps.setMatrixAt(i, this.m4);
      }
      this.wisps.instanceMatrix.needsUpdate = true;
      // shy lights: full past 25 units, gone by 10
      const fade = Math.min(1, Math.max(0, (cemD - FADE_NEAR) / (FADE_FULL - FADE_NEAR)));
      this.wispMat.opacity = 0.85 * nightRamp * fade;
      // watched from close-but-not-too-close for a spell → into the log
      if (this.wispMat.opacity > 0.15 && cemD < WATCH_R) {
        this.watchT += dt;
        if (this.watchT > WATCH_T) this.onLegend?.('wisps');
      }
    } else this.wispMat.opacity = 0;

    // --- ghost fires of Enchanted Rock ---
    const fd = Math.hypot(EROCK[0] - px, EROCK[1] - pz);
    const fOn = nightRamp > 0 && fd < FIRE_SEE;
    this.fires.visible = fOn;
    if (fOn) {
      this.rockY ??= hAt(EROCK[0], EROCK[1]);
      for (let i = 0; i < FIRE_N; i++) {
        const a = (i / FIRE_N) * Math.PI * 2 + this.t * 0.05;
        this.p.set(
          EROCK[0] + Math.cos(a) * 2.2,
          this.rockY + 5.75 + Math.sin(this.t * 6 + i * 2.4) * 0.18, // on the granite dome's shoulder
          EROCK[1] + Math.sin(a) * 2.2
        );
        this.s.setScalar(0.85 + 0.35 * Math.sin(this.t * 7 + i * 1.9));
        this.m4.compose(this.p, this.q, this.s);
        this.fires.setMatrixAt(i, this.m4);
      }
      this.fires.instanceMatrix.needsUpdate = true;
      const fade = Math.min(1, Math.max(0, (fd - 5) / 10)); // climbing right up snuffs them
      this.fireMat.opacity = 0.85 * nightRamp * fade;
      if (this.fireMat.opacity > 0.15 && fd < FIRE_LOG) this.onLegend?.('ghostfires');
    } else this.fireMat.opacity = 0;
  }
}
