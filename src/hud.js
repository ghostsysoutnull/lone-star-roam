// HUD: minimap + fullscreen map (border/highways pre-rendered once), text readouts, toasts, dialog.
import { GEO, nearestCity } from './geo.js';

export class HUD {
  constructor() {
    this.mini = document.getElementById('minimap');
    this.big = document.getElementById('bigmap');
    this.bigCanvas = document.getElementById('bigmap-canvas');
    this.els = {
      location: document.getElementById('hud-location'),
      road: document.getElementById('hud-road'),
      sky: document.getElementById('hud-sky'),
      speed: document.getElementById('hud-speed'),
      mode: document.getElementById('hud-mode'),
      cities: document.getElementById('score-cities'),
      landmarks: document.getElementById('score-landmarks'),
      roses: document.getElementById('score-roses'),
      critters: document.getElementById('score-critters'),
      counties: document.getElementById('score-counties'),
      toast: document.getElementById('toast'),
      dialog: document.getElementById('dialog'),
      interact: document.getElementById('interact-hint'),
      help: document.getElementById('help'),
    };
    this.mapLayer = this.renderMapLayer(1400, 1320);
    this.zoomLevels = [1.4, 2.4, 4.5];
    this.zoomIdx = 1;
    const s = Math.min(innerWidth, innerHeight) - 60;
    this.bigCanvas.width = s; this.bigCanvas.height = s * 0.95;
    this.toastTimer = null;
  }

  // Pre-render border + highways + cities once to an offscreen canvas
  renderMapLayer(W, H) {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const { minX, maxX, minZ, maxZ } = GEO.bounds;
    const pad = 20, sc = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxZ - minZ));
    const T = (x, z) => [(x - minX) * sc + pad, (z - minZ) * sc + pad];
    this.mapT = T; this.mapSc = sc;
    ctx.fillStyle = '#20261c';
    ctx.beginPath();
    GEO.border.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c8b878'; ctx.lineWidth = 2; ctx.stroke();
    // county lines beneath everything
    ctx.strokeStyle = '#3d4438';
    ctx.lineWidth = 0.7;
    for (const c of GEO.counties ?? []) {
      for (const ring of c.rings) {
        ctx.beginPath();
        ring.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
        ctx.closePath(); ctx.stroke();
      }
    }
    // water below roads
    ctx.strokeStyle = '#3e7aa8';
    ctx.fillStyle = '#3e7aa8';
    for (const r of GEO.rivers) {
      ctx.lineWidth = /Rio Grande|Red River/.test(r.name) ? 1.4 : 0.7;
      ctx.beginPath();
      r.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.stroke();
    }
    for (const l of GEO.lakes) {
      ctx.beginPath();
      l.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.closePath(); ctx.fill();
    }
    const roadStyle = {
      motorway: ['#c05040', 1.6], trunk: ['#907048', 0.8],
      primary: ['#6a6a52', 0.5], street: ['#4c5258', 0.4],
    };
    for (const h of GEO.highways) {
      [ctx.strokeStyle, ctx.lineWidth] = roadStyle[h.type];
      ctx.beginPath();
      h.pts.forEach(([x, z], i) => { const [px, pz] = T(x, z); i ? ctx.lineTo(px, pz) : ctx.moveTo(px, pz); });
      ctx.stroke();
    }
    ctx.fillStyle = '#e8e0c8';
    for (const city of GEO.cities) {
      const [px, pz] = T(city.x, city.z);
      const r = Math.max(1.2, Math.sqrt(city.pop) / 500);
      ctx.beginPath(); ctx.arc(px, pz, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.font = '17px system-ui'; ctx.fillStyle = '#fff';
    for (const city of GEO.cities) {
      if (city.pop < 190000) continue;
      const [px, pz] = T(city.x, city.z);
      ctx.fillText(city.name, px + 7, pz + 4);
    }
    return c;
  }

  toggleBigMap() { this.big.style.display = this.big.style.display === 'block' ? 'none' : 'block'; }

  toggleHelp(stats, ufoCount = 0) {
    const open = this.els.help.style.display !== 'block';
    if (open && stats) {
      const h = Math.floor(stats.time / 3600), m = Math.floor((stats.time % 3600) / 60);
      document.getElementById('help-stats').textContent =
        `🚗 ${Math.round(stats.dist).toLocaleString()} km traveled · ⏱ ${h ? h + ' h ' : ''}${m} min · 🏁 top ${stats.top} mph` +
        (ufoCount > 0 ? ` · 👽 ${ufoCount}` : '');
    }
    this.els.help.style.display = open ? 'block' : 'none';
  }

  cycleZoom() { this.zoomIdx = (this.zoomIdx + 1) % this.zoomLevels.length; }

  toast(msg) {
    this.els.toast.textContent = msg;
    this.els.toast.style.opacity = 1;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.els.toast.style.opacity = 0), 3200);
  }

  dialog(d) {
    if (!d) { this.els.dialog.style.display = 'none'; return; }
    this.els.dialog.querySelector('.npc-name').textContent = d.name;
    this.els.dialog.querySelector('.npc-text').textContent = d.text;
    this.els.dialog.style.display = 'block';
  }

  interactHint(name) {
    if (!name) { this.els.interact.style.display = 'none'; return; }
    this.els.interact.textContent = `E — talk to ${name}`;
    this.els.interact.style.display = 'block';
  }

  update(player, counts, road, water, clock, weatherIcon, stats, skyLine, county) {
    this.lastDist = stats?.dist ?? this.lastDist;
    this.els.sky.textContent = skyLine || '';
    // location line: nearest city + real distance
    const { city, dist } = nearestCity(player.pos.x, player.pos.z);
    const km = (dist * 0.1).toFixed(dist < 100 ? 1 : 0);
    const dx = player.pos.x - city.x, dz = player.pos.z - city.z;
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dir = dirs[Math.round(((Math.atan2(dx, -dz) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8];
    const co = county ? ` · ${county} Co.` : '';
    this.els.location.textContent = (dist < 3 ? `📍 ${city.name}` : `📍 ${km} km ${dir} of ${city.name}`) + co;
    // road when on one; water body when over one (both can show — bridges exist)
    this.els.road.textContent = [road && `🛣 ${road.ref}`, water && `🌊 ${water}`].filter(Boolean).join('   ');
    this.els.speed.innerHTML = player.mode === 'WALK' ? '🚶'
      : `${player.speedMph} <small>mph</small><div id="hud-odo">${Math.round(this.lastDist ?? 0).toLocaleString()} km</div>`;
    const icons = { DRIVE: '🚙', FLY: '✈️', WALK: '🚶' };
    this.els.mode.textContent = `${weatherIcon} ${clock} · ${icons[player.mode]} ${player.mode}${player.mode === 'FLY' ? ` — alt ${Math.round(player.pos.y * 100 / 1000 * 10) / 10} km` : ''} — V to change`;
    this.els.cities.textContent = counts.cities;
    this.els.landmarks.textContent = counts.landmarks;
    this.els.roses.textContent = counts.roses;
    this.els.critters.textContent = counts.species;
    this.els.counties.textContent = counts.counties;

    this.drawMini(player);
    if (this.big.style.display === 'block') this.drawBig(player);
  }

  drawMini(player) {
    const ctx = this.mini.getContext('2d');
    const W = this.mini.width, H = this.mini.height;
    ctx.clearRect(0, 0, W, H);
    // zoomed window around player from the prerendered layer
    const [px, pz] = this.mapT(player.pos.x, player.pos.z);
    const zoom = this.zoomLevels[this.zoomIdx], sw = W / zoom, sh = H / zoom;
    ctx.drawImage(this.mapLayer, px - sw / 2, pz - sh / 2, sw, sh, 0, 0, W, H);
    // player arrow
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-player.heading + Math.PI);
    ctx.fillStyle = '#ffd35c';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 8); ctx.lineTo(-6, 8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  drawBig(player) {
    const ctx = this.bigCanvas.getContext('2d');
    const W = this.bigCanvas.width, H = this.bigCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.mapLayer, 0, 0, W, H);
    const sx = W / this.mapLayer.width, sy = H / this.mapLayer.height;
    const [px, pz] = this.mapT(player.pos.x, player.pos.z);
    ctx.fillStyle = '#ffd35c';
    ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(px * sx, pz * sy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}
