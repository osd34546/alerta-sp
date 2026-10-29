/* Alerta SP — mapa da Grande São Paulo (SVG): arrastar, zoom, nomes que aparecem conforme a aproximação,
 * sensores e áreas coloridas pelo nível de risco. Mapa esquemático: limites aproximados. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (n, a, p) => { const e = document.createElementNS(NS, n); for (const k in a || {}) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const RANK = { offline: -1, normal: 0, attention: 1, risk: 2, flood: 3 };
  const M_PER_UNIT = 111320 / 2000;
  const nums = d => (d.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const polyOf = d => { const n = nums(d), p = []; for (let i = 0; i < n.length; i += 2) p.push([n[i], n[i + 1]]); return p; };
  const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const reduce = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function create(host, geo, opts) {
    opts = opts || {};
    const P = geo.proj, toXY = (lat, lon) => [(lon - P.lon0) * P.cos * P.s, (P.lat0 - lat) * P.s];
    const S = { k: 1, tx: 0, ty: 0, w: 0, h: 0, kFit: 1, kMin: .1, kMax: 10, selectedPlace: null, selectedSensor: null, hover: null };
    const places = new Map(), sensors = new Map(), outlinePoly = polyOf(geo.outline);
    let fly = 0, labelTimer = 0, destroyed = false;

    host.textContent = '';
    const svg = el('svg', { class: 'sp-map', role: 'application', tabindex: '0', 'aria-label': 'Mapa esquemático da Grande São Paulo. Arraste para mover, use a roda do mouse ou os botões para aproximar. Setas movem o mapa; mais e menos aproximam.' });
    const defs = el('defs', {}, svg);
    const cap = el('clipPath', { id: 'cap-clip' }, defs); el('path', { d: geo.outline }, cap);
    const pat = el('pattern', { id: 'flood-waves', width: '34', height: '14', patternUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: 'M0 7 Q8.5 0 17 7 T34 7', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.4', 'stroke-linecap': 'round' }, pat);
    const patAnim = el('animateTransform', { attributeName: 'patternTransform', type: 'translate', from: '0 0', to: '34 0', dur: '5s', repeatCount: 'indefinite' }, pat);
    const vp = el('g', { class: 'viewport' }, svg);
    el('path', { class: 'lens', d: geo.lens }, vp);
    const gMunis = el('g', { class: 'munis' }, vp);
    el('path', { class: 'capital-base', d: geo.outline }, vp);
    const gDist = el('g', { class: 'districts', 'clip-path': 'url(#cap-clip)' }, vp);
    const gWater = el('g', { class: 'waters' }, vp);
    const gFlood = el('g', { class: 'floods', 'clip-path': 'url(#cap-clip)' }, vp);
    const outline = el('path', { class: 'capital-outline', d: geo.outline }, vp);
    const gLabels = el('g', { class: 'labels' }, vp);
    const gSens = el('g', { class: 'sensors' }, vp);

    // ---- polígonos
    function addPlace(kind, o, parent) {
      const key = kind + ':' + o.id, path = el('path', { class: 'place ' + kind, d: o.d, 'data-key': key }, parent);
      if (o.zone) path.setAttribute('data-zone', o.zone);
      const bb = nums(o.d); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (let i = 0; i < bb.length; i += 2) { x0 = Math.min(x0, bb[i]); x1 = Math.max(x1, bb[i]); y0 = Math.min(y0, bb[i + 1]); y1 = Math.max(y1, bb[i + 1]); }
      const p = { key, kind, id: o.id, name: o.name, sub: o.sub || '', zone: o.zone || '', x: o.x, y: o.y, la: o.la, lo: o.lo, path, area: Math.min((x1 - x0) * (y1 - y0), 90000), sensors: [] };
      places.set(key, p); return p;
    }
    geo.munis.forEach(m => addPlace('m', m, gMunis));
    geo.districts.forEach(d => addPlace('d', d, gDist));
    geo.bairros.forEach(b => places.set('b:' + b.id, { key: 'b:' + b.id, kind: 'b', id: b.id, name: b.name, x: b.x, y: b.y, la: b.la, lo: b.lo, dist: 'd:' + b.dist, area: 0, sensors: [] }));

    geo.lakes.forEach(l => { el('path', { class: 'lake', d: l.d }, gWater); });
    const riverEls = geo.rivers.map(r => ({ r, node: el('path', { class: 'river', d: r.d }, gWater) }));

    // ---- rótulos
    const labelItems = [];
    function addLabel(text, x, y, cls, prio, place, minK) {
      const t = el('text', { class: 'lbl ' + cls, x, y, 'text-anchor': 'middle' }, gLabels); t.textContent = text;
      const it = { t, x, y, prio, place, minK, fs: cls.indexOf('m') === 0 ? 12.5 : cls.indexOf('b') === 0 ? 10.5 : cls.indexOf('w') === 0 ? 10.5 : 11.5, len: text.length, cls };
      labelItems.push(it); return it;
    }
    geo.munis.forEach(m => addLabel(m.name, m.x, m.y, 'm', 60 + Math.min(m.name.length, 22), places.get('m:' + m.id), 0));
    geo.districts.forEach(d => { const p = places.get('d:' + d.id); addLabel(d.name, d.x, d.y, 'd', 40 + Math.sqrt(p.area) / 8, p, 0.92); });
    geo.bairros.forEach(b => addLabel(b.name, b.x, b.y, 'b', 10, places.get('b:' + b.id), 3.4));
    geo.rivers.forEach(r => addLabel(r.name, r.mid[0], r.mid[1], 'w', 30, null, 1.6));
    geo.lakes.forEach(l => addLabel(l.name, l.x, l.y, 'w', 30, null, 1.4));

    // ---- sensores
    function hostOf(lat, lon) {
      const [x, y] = toXY(lat, lon), inCap = inside([x, y], outlinePoly), kind = inCap ? 'd' : 'm';
      let best = null, bd = 1e12; places.forEach(p => { if (p.kind !== kind) return; const dd = (p.x - x) ** 2 + (p.y - y) ** 2; if (dd < bd) { bd = dd; best = p; } });
      return best;
    }
    function setSensors(list) {
      gSens.textContent = ''; sensors.clear(); places.forEach(p => p.sensors = []);
      list.forEach(s => {
        const [x, y] = toXY(s.lat, s.lon), g = el('g', { class: 'sensor', 'data-sensor': s.id, role: 'button', tabindex: '-1', 'aria-label': 'Sensor ' + s.name }, gSens);
        const inner = el('g', { class: 'sensor-in' }, g);
        el('circle', { class: 'halo', r: 15 }, inner); el('circle', { class: 'ring', r: 12 }, inner); el('circle', { class: 'dot', r: 7 }, inner); el('path', { class: 'tick', d: 'M0 -3.2V3.2M-2.6 -1.2H2.6M-2.6 1.2H2.6' }, inner);
        const host = hostOf(s.lat, s.lon); if (host) host.sensors.push(s.id);
        sensors.set(s.id, { g, x, y, host, levelKey: 'normal' });
      });
      applyZoom();
    }
    function refresh(list, selectedId) {
      S.selectedSensor = selectedId;
      const worst = new Map();
      list.forEach(s => {
        const m = sensors.get(s.id); if (!m) return;
        m.levelKey = s.levelKey; m.g.setAttribute('data-level', s.levelKey); m.g.classList.toggle('is-selected', s.id === selectedId);
        m.g.setAttribute('aria-label', 'Sensor ' + s.name + ', ' + (s.levelLabel || s.levelKey) + (s.id === selectedId ? ', selecionado' : ''));
        if (m.host) { const cur = worst.get(m.host.key); if (cur === undefined || RANK[s.levelKey] > RANK[cur]) worst.set(m.host.key, s.levelKey); }
      });
      places.forEach(p => {
        if (p.kind === 'b') return; const lv = worst.get(p.key) || '';
        if (lv) p.path.setAttribute('data-level', lv); else p.path.removeAttribute('data-level');
        if (lv === 'flood' || lv === 'risk') { if (!p.flood) p.flood = el('path', { class: 'flood-fill', d: p.path.getAttribute('d'), 'pointer-events': 'none' }, gFlood); p.flood.setAttribute('data-level', lv); }
        else if (p.flood) { p.flood.remove(); p.flood = null; }
      });
      // sensores selecionados ficam por cima
      const sel = sensors.get(selectedId); if (sel) gSens.appendChild(sel.g);
    }
    function select(placeKey, sensorId) {
      if (S.selectedPlace) { const o = places.get(S.selectedPlace); if (o && o.path) o.path.classList.remove('is-selected'); }
      S.selectedPlace = placeKey;
      if (placeKey) { const p = places.get(placeKey); const t = p && (p.kind === 'b' ? places.get(p.dist) : p); if (t && t.path) { t.path.classList.add('is-selected'); S.selectedPlace = t.key; gDist.appendChild(t.path); } }
      scheduleLabels(0);
    }

    // ---- enquadramento
    const bb = geo.bbox, capW = bb.x1 - bb.x0, capH = bb.y1 - bb.y0, capC = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2];
    function measure() {
      const r = host.getBoundingClientRect(); S.w = Math.max(r.width, 10); S.h = Math.max(r.height, 10);
      const m = S.w < 600 ? 0.84 : 0.8; S.kFit = Math.min(S.w / capW, S.h / capH) * m;
      const kLens = Math.min(S.w / geo.w, S.h / geo.h) * 0.98;
      S.kMin = Math.min(kLens, S.kFit * .55); S.kMax = S.kFit * 16;
    }
    function constrain() {
      S.k = clamp(S.k, S.kMin, S.kMax);
      const pad = Math.min(S.w, S.h) * .35, minX = pad - geo.w * S.k, maxX = S.w - pad, minY = pad - geo.h * S.k, maxY = S.h - pad;
      S.tx = clamp(S.tx, minX, maxX); S.ty = clamp(S.ty, minY, maxY);
    }
    function applyZoom() {
      constrain();
      vp.setAttribute('transform', 'translate(' + S.tx.toFixed(2) + ' ' + S.ty.toFixed(2) + ') scale(' + S.k.toFixed(5) + ')');
      svg.style.setProperty('--k', S.k.toFixed(5));
      const inv = 1 / S.k;
      sensors.forEach(m => m.g.setAttribute('transform', 'translate(' + m.x + ' ' + m.y + ') scale(' + inv.toFixed(5) + ')'));
      const z = S.k / S.kFit; riverEls.forEach(({ r, node }) => node.style.strokeWidth = (clamp(r.w * .55 * Math.sqrt(z), 1.6, 12) * inv).toFixed(3));
      svg.setAttribute('data-zoom', z < .95 ? 'far' : z < 2.2 ? 'mid' : z < 4.5 ? 'near' : 'close');
      updateScale(); opts.onView && opts.onView(view());
    }
    const view = () => ({ k: S.k, zoom: S.k / S.kFit, cx: (S.w / 2 - S.tx) / S.k, cy: (S.h / 2 - S.ty) / S.k });
    function resetView(animate) { goTo(capC[0], capC[1], S.kFit, animate); }
    function goTo(wx, wy, k, animate) {
      const kk = clamp(k, S.kMin, S.kMax), tx = S.w / 2 - wx * kk, ty = S.h / 2 - wy * kk;
      cancelAnimationFrame(fly);
      if (!animate || reduce()) { S.k = kk; S.tx = tx; S.ty = ty; applyZoom(); scheduleLabels(0); return; }
      const k0 = S.k, x0 = S.tx, y0 = S.ty, t0 = performance.now(), dur = 650;
      // interpola no espaço do centro para o zoom parecer contínuo
      const c0 = [(S.w / 2 - x0) / k0, (S.h / 2 - y0) / k0];
      (function step(now) {
        if (destroyed) return; const t = clamp((now - t0) / dur, 0, 1), e = t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        const k = k0 * Math.pow(kk / k0, e), cx = c0[0] + (wx - c0[0]) * e, cy = c0[1] + (wy - c0[1]) * e;
        S.k = k; S.tx = S.w / 2 - cx * k; S.ty = S.h / 2 - cy * k; applyZoom();
        if (t < 1) fly = requestAnimationFrame(step); else scheduleLabels(0);
      })(t0);
    }
    function zoomAt(f, sx, sy) { const k = clamp(S.k * f, S.kMin, S.kMax), r = k / S.k; S.tx = sx - (sx - S.tx) * r; S.ty = sy - (sy - S.ty) * r; S.k = k; applyZoom(); scheduleLabels(120); }
    function panBy(dx, dy) { S.tx += dx; S.ty += dy; applyZoom(); scheduleLabels(120); }
    function focusSensor(id, animate) { const m = sensors.get(id); if (m) goTo(m.x, m.y, Math.max(S.k, S.kFit * 3.4), animate !== false); }
    function focusPlace(key, animate) { const p = places.get(key); if (!p) return; const z = p.kind === 'm' ? 2 : p.kind === 'b' ? 5 : 3.4; goTo(p.x, p.y, Math.max(S.kFit * z, S.k * (S.k > S.kFit * z ? 1 : 1)), animate !== false); }

    // ---- rótulos sem colisão
    function scheduleLabels(ms) { clearTimeout(labelTimer); labelTimer = setTimeout(layoutLabels, ms); }
    function layoutLabels() {
      if (destroyed || !S.w) return;
      const z = S.k / S.kFit, W = S.w, H = S.h, taken = [];
      const hit = (a) => { for (let i = 0; i < taken.length; i++) { const b = taken[i]; if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) return true; } return false; };
      sensors.forEach(m => { const x = m.x * S.k + S.tx, y = m.y * S.k + S.ty; taken.push([x - 11, y - 11, x + 11, y + 11]); });
      const selKey = S.selectedPlace, cand = [];
      labelItems.forEach(it => {
        const x = it.x * S.k + S.tx, y = it.y * S.k + S.ty;
        let show = x > -40 && x < W + 40 && y > -20 && y < H + 20 && z >= it.minK * (it.cls === 'm' ? 0 : 1);
        if (it.cls === 'm' && z > 7) show = false;
        if (it.cls === 'm' && z > 2.4 && x > -40) show = show && (it.prio > 70); // cidades menores somem de perto
        it.sx = x; it.sy = y; it.on = false;
        if (show) cand.push(it);
      });
      cand.sort((a, b) => ((b.place && b.place.key === selKey) ? 1e4 : 0) - ((a.place && a.place.key === selKey) ? 1e4 : 0) || ((b.place && b.place.sensors.length) ? 500 : 0) - ((a.place && a.place.sensors.length) ? 500 : 0) || b.prio - a.prio);
      cand.forEach(it => {
        const hasSensor = it.place && it.place.sensors && it.place.sensors.length && it.cls === 'd';
        const w = it.len * it.fs * .56 + 8, h = it.fs * 1.5, yOff = hasSensor ? 17 : 0;
        const rect = [it.sx - w / 2, it.sy + yOff - h * .75, it.sx + w / 2, it.sy + yOff + h * .35];
        if (hit(rect)) return; taken.push(rect); it.on = true;
        it.t.setAttribute('y', (it.y + yOff / S.k).toFixed(2));
      });
      labelItems.forEach(it => { const on = !!it.on, was = it.t.classList.contains('on'); if (on !== was) it.t.classList.toggle('on', on); });
    }

    // ---- escala
    function updateScale() {
      const bar = opts.scale; if (!bar) return;
      const mPerPx = M_PER_UNIT / S.k, target = 110 * mPerPx, nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
      let m = nice[0]; for (const n of nice) if (n <= target) m = n;
      const px = m / mPerPx; bar.style.setProperty('--w', px.toFixed(0) + 'px'); bar.setAttribute('data-label', m >= 1000 ? (m / 1000) + ' km' : m + ' m');
    }

    // ---- interação (arrastar, pinça, roda, teclado)
    const ptrs = new Map(); let down = null, moved = false, pinch = null;
    svg.addEventListener('pointerdown', e => {
      if (e.button > 0) return; cancelAnimationFrame(fly); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { down = { x: e.clientX, y: e.clientY, tx: S.tx, ty: S.ty, target: e.target }; moved = false; svg.classList.add('is-drag-ready'); }
      if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: S.k }; moved = true; }
    });
    root.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) { hoverMove(e); return; }
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2 && pinch) {
        const [a, b] = [...ptrs.values()], r = svg.getBoundingClientRect(), d = Math.hypot(a.x - b.x, a.y - b.y);
        const k = clamp(pinch.k * d / pinch.d, S.kMin, S.kMax), mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top, ratio = k / S.k;
        S.tx = mx - (mx - S.tx) * ratio; S.ty = my - (my - S.ty) * ratio; S.k = k; applyZoom(); scheduleLabels(140); return;
      }
      if (down && ptrs.size === 1) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!moved && Math.hypot(dx, dy) > 5) { moved = true; svg.classList.add('is-dragging'); hideTip(); }
        if (moved) { S.tx = down.tx + dx; S.ty = down.ty + dy; applyZoom(); scheduleLabels(140); }
      }
    });
    function endPtr(e) {
      if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
      if (ptrs.size < 2) pinch = null;
      if (ptrs.size === 0 && down) { const wasMoved = moved, t = down.target; down = null; svg.classList.remove('is-dragging', 'is-drag-ready'); if (!wasMoved && e.type === 'pointerup') clickAt(t, e); scheduleLabels(0); }
      else if (ptrs.size === 1) { const [p] = [...ptrs.values()]; down = { x: p.x, y: p.y, tx: S.tx, ty: S.ty, target: null }; }
    }
    root.addEventListener('pointerup', endPtr); root.addEventListener('pointercancel', endPtr);
    function clickAt(t, e) {
      const sn = t && t.closest && t.closest('[data-sensor]');
      if (sn) { opts.onSensor && opts.onSensor(sn.getAttribute('data-sensor')); return; }
      const pl = t && t.closest && t.closest('[data-key]');
      if (pl) { const p = places.get(pl.getAttribute('data-key')); if (p) opts.onPlace && opts.onPlace(p.key, p); }
    }
    svg.addEventListener('wheel', e => { e.preventDefault(); cancelAnimationFrame(fly); const r = svg.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? .01 : .0016)), e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    svg.addEventListener('dblclick', e => { const r = svg.getBoundingClientRect(); zoomAt(1.8, e.clientX - r.left, e.clientY - r.top); });
    svg.addEventListener('keydown', e => {
      const st = 70; const k = e.key;
      if (k === 'ArrowLeft') panBy(st, 0); else if (k === 'ArrowRight') panBy(-st, 0); else if (k === 'ArrowUp') panBy(0, st); else if (k === 'ArrowDown') panBy(0, -st);
      else if (k === '+' || k === '=') zoomAt(1.4, S.w / 2, S.h / 2); else if (k === '-' || k === '_') zoomAt(1 / 1.4, S.w / 2, S.h / 2); else if (k === '0') resetView(true); else return;
      e.preventDefault();
    });
    // dica ao passar o mouse
    const tip = document.createElement('div'); tip.className = 'map-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; host.appendChild(tip);
    function hideTip() { tip.hidden = true; }
    function hoverMove(e) {
      if (e.pointerType === 'touch' || !svg.contains(e.target)) { if (!tip.hidden) hideTip(); return; }
      const sn = e.target.closest && e.target.closest('[data-sensor]'), pl = e.target.closest && e.target.closest('[data-key]');
      let html = '';
      if (sn) { const id = sn.getAttribute('data-sensor'), m = sensors.get(id); html = opts.sensorTip ? opts.sensorTip(id) : id; }
      else if (pl) { const p = places.get(pl.getAttribute('data-key')); if (p) html = '<b>' + p.name + '</b><span>' + (p.kind === 'd' ? 'Distrito · ' + (p.sub ? 'Subprefeitura ' + p.sub : '') + (p.zone ? ' · Zona ' + p.zone : '') : 'Município da Grande São Paulo') + (p.sensors.length ? ' · ' + p.sensors.length + ' sensor' + (p.sensors.length > 1 ? 'es' : '') : '') + '</span>'; }
      if (!html) { hideTip(); return; }
      const r = host.getBoundingClientRect(); tip.innerHTML = html; tip.hidden = false;
      const x = clamp(e.clientX - r.left + 14, 6, r.width - tip.offsetWidth - 6), y = clamp(e.clientY - r.top + 16, 6, r.height - tip.offsetHeight - 6); tip.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    }
    svg.addEventListener('pointerleave', hideTip);

    // controles (botões)
    const ctl = opts.controls;
    if (ctl) ctl.addEventListener('click', e => {
      const b = e.target.closest('[data-map]'); if (!b) return; const a = b.getAttribute('data-map');
      if (a === 'in') zoomAt(1.5, S.w / 2, S.h / 2); else if (a === 'out') zoomAt(1 / 1.5, S.w / 2, S.h / 2); else if (a === 'reset') resetView(true);
    });

    // animação das ondas respeita movimento reduzido
    function motion() { try { if (reduce()) patAnim.endElement && patAnim.endElement(); else patAnim.beginElement && patAnim.beginElement(); } catch (_) { } svg.classList.toggle('reduced', reduce()); }
    const mq = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)'); mq && mq.addEventListener && mq.addEventListener('change', motion);

    host.appendChild(svg);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { const had = S.w; const c = view(); measure(); if (!had) resetView(false); else { S.tx = S.w / 2 - c.cx * S.k; S.ty = S.h / 2 - c.cy * S.k; applyZoom(); } scheduleLabels(60); }) : null;
    ro && ro.observe(host);
    measure(); resetView(false); motion(); layoutLabels();

    // busca em lugares (distritos, municípios, bairros)
    function searchPlaces(q, limit) {
      const n = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(), qq = n(q.trim()); if (!qq) return [];
      const out = []; places.forEach(p => { const nm = n(p.name + ' ' + (p.sub || '')); const i = nm.indexOf(qq); if (i >= 0) out.push({ p, score: (n(p.name).startsWith(qq) ? 0 : i === 0 ? 1 : 2) + (p.kind === 'b' ? .5 : p.kind === 'm' ? .2 : 0) }); });
      return out.sort((a, b) => a.score - b.score || a.p.name.localeCompare(b.p.name)).slice(0, limit || 8).map(o => o.p);
    }
    return {
      svg, setSensors, refresh, select, focusSensor, focusPlace, resetView, zoomAt: (f) => zoomAt(f, S.w / 2, S.h / 2), searchPlaces,
      place: k => places.get(k), hostKeyOf: id => { const m = sensors.get(id); return m && m.host ? m.host.key : null; },
      relayout: () => { measure(); applyZoom(); layoutLabels(); }, view,
      destroy() { destroyed = true; ro && ro.disconnect(); cancelAnimationFrame(fly); clearTimeout(labelTimer); }
    };
  }
  root.AlertaMap = { create };
})(window);
