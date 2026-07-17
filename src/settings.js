// Settings panel (New Player W3): the five hidden keybind settings — sound,
// UI text size, compass, guide arrow, brand-building size — as a visible
// labeled panel on the pause screen and the title screen. Storage-agnostic by
// design: every control calls the exact function its keybind calls
// (audio.toggleMute, hud.uiScale, hud.toggleCompass, missions.toggleArrow,
// brands.setScale) and reads live state back, so W4 can slot per-slot storage
// under those functions without touching this panel. One builder mounted
// twice; both instances re-read state on every change so they never disagree.
export function initSettings({ audio, hud, missions, brands }) {
  // toggles read live state; steppers show the label their function returns
  const ROWS = [
    { key: 'mute', label: 'Sound', kbd: 'N', kind: 'toggle',
      get: () => !audio.muted, set: () => void audio.toggleMute() },
    { key: 'ui', label: 'UI text size', kbd: '+ −', kind: 'step',
      get: () => Math.round(hud.ui * 100) + '%', step: (dir) => void hud.uiScale(dir) },
    { key: 'compass', label: 'Compass', kbd: 'C', kind: 'toggle',
      get: () => hud.compass.style.display !== 'none', set: () => void hud.toggleCompass() },
    { key: 'arrow', label: 'Guide arrow', kbd: 'G', kind: 'toggle',
      get: () => missions.arrowOn, set: () => void missions.toggleArrow() },
    { key: 'brand', label: 'Brand buildings', kbd: '[ ]', kind: 'step',
      get: () => Math.round(brands.scale * 100) + '%', step: (dir) => void brands.setScale(brands.scale + dir * 0.05) },
  ];

  const panels = [];
  const refresh = () => {
    for (const panel of panels) {
      for (const row of ROWS) {
        const el = panel.querySelector(`[data-set="${row.key}"]`);
        if (row.kind === 'toggle') el.textContent = row.get() ? 'On' : 'Off';
        else el.textContent = row.get();
      }
    }
  };

  const mount = (container) => {
    const panel = document.createElement('div');
    panel.className = 'settings';
    const h = document.createElement('h3');
    h.textContent = '⚙ Settings';
    panel.appendChild(h);
    for (const row of ROWS) {
      const line = document.createElement('div');
      line.className = 'settings-row';
      const name = document.createElement('span');
      name.innerHTML = `${row.label} <kbd>${row.kbd}</kbd>`;
      line.appendChild(name);
      if (row.kind === 'toggle') {
        const btn = document.createElement('button');
        btn.dataset.set = row.key;
        btn.addEventListener('click', () => { row.set(); refresh(); });
        line.appendChild(btn);
      } else {
        const group = document.createElement('span');
        group.className = 'settings-step';
        const minus = document.createElement('button');
        minus.textContent = '−';
        minus.dataset.set = row.key + '-';
        minus.addEventListener('click', () => { row.step(-1); refresh(); });
        const val = document.createElement('span');
        val.dataset.set = row.key;
        const plus = document.createElement('button');
        plus.textContent = '+';
        plus.dataset.set = row.key + '+';
        plus.addEventListener('click', () => { row.step(1); refresh(); });
        group.append(minus, val, plus);
        line.appendChild(group);
      }
      panel.appendChild(line);
    }
    container.appendChild(panel);
    panels.push(panel);
    refresh();
    return panel;
  };

  return { mount, refresh };
}
