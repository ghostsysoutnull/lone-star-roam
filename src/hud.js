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
      legends: document.getElementById('score-legends'),
      counties: document.getElementById('score-counties'),
      bank: document.getElementById('score-bank'),
      job: document.getElementById('hud-job'),
      toast: document.getElementById('toast'),
      dialog: document.getElementById('dialog'),
      interact: document.getElementById('interact-hint'),
      help: document.getElementById('help'),
    };
    this.mapLayer = this.renderMapLayer(1400, 1320);
    this.zoomLevels = [1.4, 2.4, 4.5];
    this.zoomIdx = 1;
    this.compass = document.getElementById('compass');
    if (localStorage.getItem('lonestar-compass') === 'off') this.compass.style.display = 'none';
    // UI scale: CSS is rem-based (1rem = 10px at 100%), so one root font-size drives it all
    this.ui = Math.max(0.9, Math.min(2, parseFloat(localStorage.getItem('lonestar-ui-scale')) || 1));
    this.applyUiScale();
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

  toggleHelp(stats, ufoCount = 0, bank = 0, jobsDone = 0) {
    const open = this.els.help.style.display !== 'block';
    if (open && stats) {
      const h = Math.floor(stats.time / 3600), m = Math.floor((stats.time % 3600) / 60);
      document.getElementById('help-stats').textContent =
        `🚗 ${Math.round(stats.dist).toLocaleString()} km traveled · ⏱ ${h ? h + ' h ' : ''}${m} min · 🏁 top ${stats.top} mph` +
        (jobsDone > 0 ? ` · 📦 ${jobsDone} hauls · 💵 $${bank.toLocaleString()}` : '') +
        (ufoCount > 0 ? ` · 👽 ${ufoCount}` : '');
    }
    this.els.help.style.display = open ? 'block' : 'none';
  }

  cycleZoom() { this.zoomIdx = (this.zoomIdx + 1) % this.zoomLevels.length; }

  applyUiScale() { document.documentElement.style.fontSize = 10 * this.ui + 'px'; }

  // step the UI scale ±10% (dir ±1), clamped to 90%–200%; returns the label for the toast
  uiScale(dir) {
    this.ui = Math.round(Math.max(0.9, Math.min(2, this.ui + dir * 0.1)) * 10) / 10;
    this.applyUiScale();
    localStorage.setItem('lonestar-ui-scale', this.ui);
    return Math.round(this.ui * 100) + '%';
  }

  toggleCompass() {
    const off = this.compass.style.display !== 'none';
    this.compass.style.display = off ? 'none' : 'block';
    localStorage.setItem('lonestar-compass', off ? 'off' : 'on');
    return !off;
  }

  // sliding compass tape: cardinals, 15° ticks, degree readout, gold nearest-city pip
  drawCompass(player, city) {
    if (this.compass.style.display === 'none') return;
    const ctx = this.compass.getContext('2d');
    const W = this.compass.width, H = this.compass.height;
    ctx.clearRect(0, 0, W, H);
    // heading: 0 = north, increases counterclockwise in game space; compass shows clockwise degrees
    const deg = ((-player.heading * 180) / Math.PI % 360 + 360) % 360;
    const PX_PER_DEG = W / 120; // 120° field of view on the tape
    const label = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    ctx.textAlign = 'center';
    // walk absolute 15° tick marks inside the visible window (not offsets from the
    // heading — those only align with the grid when the heading itself is a multiple)
    for (let td = Math.ceil((deg - 60) / 15) * 15; td <= deg + 60; td += 15) {
      const d = ((td % 360) + 360) % 360;
      const x = W / 2 + (td - deg) * PX_PER_DEG;
      const cardinal = label[d];
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = cardinal ? 3 : 1.5;
      ctx.beginPath();
      ctx.moveTo(x, H);
      ctx.lineTo(x, H - (cardinal ? 22 : d % 45 === 0 ? 16 : 10));
      ctx.stroke();
      if (cardinal) {
        ctx.font = 'bold 26px system-ui';
        ctx.fillStyle = cardinal === 'N' ? '#ff8866' : '#fff';
        ctx.fillText(cardinal, x, H - 32);
      }
    }
    // nearest-city pip
    if (city) {
      const cityDeg = ((Math.atan2(city.x - player.pos.x, -(city.z - player.pos.z)) * 180) / Math.PI % 360 + 360) % 360;
      let rel = cityDeg - deg;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      const x = Math.max(10, Math.min(W - 10, W / 2 + rel * PX_PER_DEG));
      ctx.fillStyle = '#ffd35c';
      ctx.beginPath();
      ctx.arc(x, 12, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    // mission target diamond (same bearing math as the city pip; clamps at the ends)
    if (this.mission?.target) {
      const [mx, mz] = this.mission.target;
      const tDeg = ((Math.atan2(mx - player.pos.x, -(mz - player.pos.z)) * 180) / Math.PI % 360 + 360) % 360;
      let rel = tDeg - deg;
      if (rel > 180) rel -= 360;
      if (rel < -180) rel += 360;
      const x = Math.max(14, Math.min(W - 14, W / 2 + rel * PX_PER_DEG));
      this.diamond(ctx, x, 13, 8);
    }
    // center caret + degree readout
    ctx.fillStyle = '#ffd35c';
    ctx.beginPath();
    ctx.moveTo(W / 2 - 8, 0); ctx.lineTo(W / 2 + 8, 0); ctx.lineTo(W / 2, 12);
    ctx.closePath(); ctx.fill();
    ctx.font = '20px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.round(deg)}°`, 10, 30);
  }

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

  interactHint(label) {
    if (!label) { this.els.interact.style.display = 'none'; return; }
    this.els.interact.textContent = `E — ${label}`;
    this.els.interact.style.display = 'block';
  }

  update(player, counts, road, water, clock, weatherIcon, stats, skyLine, county, forecast) {
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
    this.els.mode.textContent = `${weatherIcon} ${clock}${forecast ? ` · ${forecast}` : ''} · ${icons[player.mode]} ${player.mode}${player.mode === 'FLY' ? ` — alt ${Math.round(player.pos.y * 100 / 1000 * 10) / 10} km · F 🧨×${player.flares?.charges ?? 0}` : ''} — V to change`;
    this.els.cities.textContent = counts.cities;
    this.els.landmarks.textContent = counts.landmarks;
    this.els.roses.textContent = counts.roses;
    this.els.critters.textContent = counts.species;
    this.els.legends.textContent = counts.legends ?? 0;
    this.els.counties.textContent = counts.counties;
    this.els.bank.textContent = (counts.bank ?? 0).toLocaleString();
    // active delivery line (set by main from missions.hudInfo)
    this.els.job.textContent = this.mission?.text ?? '';
    this.els.job.style.color = this.mission?.late ? '#ff7a66' : this.mission?.urgent ? '#ffb04a' : '#ffd35c';

    this.drawMini(player);
    this.drawCompass(player, city);
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
    // delivery target: gold diamond, clamped to the edge as a direction pointer
    if (this.mission?.target) {
      const [tx, tz] = this.mapT(this.mission.target[0], this.mission.target[1]);
      const mx = Math.max(10, Math.min(W - 10, (tx - px + sw / 2) * zoom));
      const my = Math.max(10, Math.min(H - 10, (tz - pz + sh / 2) * zoom));
      this.diamond(ctx, mx, my, 8);
    }
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
    if (this.mission?.target) {
      const [tx, tz] = this.mapT(this.mission.target[0], this.mission.target[1]);
      this.diamond(ctx, tx * sx, tz * sy, 9);
    }
    ctx.fillStyle = '#ffd35c';
    ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(px * sx, pz * sy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  diamond(ctx, x, y, r) {
    ctx.fillStyle = this.mission?.late ? '#ff7a66' : '#ffd35c';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
