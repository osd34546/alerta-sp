/* Alerta SP — liga as peças: regras (core), mapa, clima e tela.
 * Todos os dados são de demonstração: nenhum sensor físico está conectado. */
(function () {
  'use strict';
  const C = window.AlertaCore, $ = id => document.getElementById(id), NS = 'http://www.w3.org/2000/svg';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) { } }
  };
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const reduceMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  const L = C.LEVEL, ORDER = ['flood', 'risk', 'attention', 'normal', 'offline'];

  /* ---------- estado ---------- */
  const sensors = {}; C.SEED.forEach(s => sensors[s.id] = C.createSensor(s, Date.now()));
  const list = () => C.SEED.map(s => sensors[s.id]);
  const alerts = C.createAlertCenter(), dismissed = new Set();
  let selectedId = 'anhangabau', placeInfo = null, timer = 0, lastT = 0;

  const sim = C.createSimulation(id => sensors[id], alerts, {
    onChange() { syncSim(); },
    onAlert(ev) { notify(ev); }
  });

  /* ---------- mapa e clima ---------- */
  const map = window.AlertaMap.create($('map'), window.SP_GEO, {
    controls: $('map-ctl'), scale: $('scale'),
    onSensor(id) { selectSensor(id, false); },
    onPlace(key, p) { map.select(key); if (p.sensors && p.sensors.length) selectSensor(p.sensors[0], false); else { placeInfo = p; renderChip(); } },
    sensorTip(id) { const s = sensors[id], lv = L[s.levelKey]; return '<b>' + esc(s.name) + '</b><span>' + (s.online ? Math.round(s.water) + ' cm · ' : '') + lv.label + ' · ' + srcLabel(s.source) + '</span>'; }
  });
  map.setSensors(list().map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, levelKey: s.levelKey })));
  const weather = window.AlertaWeather.create($('fx'), {});

  /* ---------- textos ---------- */
  function srcLabel(k) { return { demo: 'Demonstração', sim: 'Simulado', manual: 'Ajustado por você', real: 'Sensor real' }[k] || 'Demonstração'; }
  function ago(t) { const d = Math.max(0, Math.round((Date.now() - t) / 1000)); if (d < 5) return 'agora'; if (d < 60) return 'há ' + d + ' s'; if (d < 3600) return 'há ' + Math.round(d / 60) + ' min'; return 'há ' + Math.round(d / 3600) + ' h'; }
  function clock(t) { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  function rainWord(mm) { return mm <= 0 ? 'Chuva parando' : mm <= 10 ? 'Chuva leve' : mm <= 46 ? 'Chuva forte' : 'Temporal'; }
  const icon = id => '<svg aria-hidden="true"><use href="#' + id + '"/></svg>';
  const toneIcon = (tone, up) => tone === 'offline' ? 'i-off' : (tone === 'normal' ? 'i-ok' : 'i-alert');

  /* ---------- faixa de situação ---------- */
  function renderSituation() {
    const cnt = { flood: 0, risk: 0, attention: 0, normal: 0, offline: 0 }; list().forEach(s => cnt[s.levelKey]++);
    const worst = ORDER.find(k => k !== 'offline' && cnt[k]) || 'normal', n = k => cnt[k];
    const plural = (c, a, b) => c + ' ' + (c === 1 ? a : b);
    const title = worst === 'flood' ? 'Alagamento em ' + plural(n('flood'), 'ponto', 'pontos')
      : worst === 'risk' ? 'Risco elevado em ' + plural(n('risk'), 'ponto', 'pontos')
      : worst === 'attention' ? 'Atenção em ' + plural(n('attention'), 'ponto', 'pontos') : 'Todos os pontos em nível normal';
    $('situation').setAttribute('data-level', worst); $('sit-title').textContent = title;
    const bits = ['Demonstração, sem sensores físicos'];
    if (cnt.offline) bits.push(cnt.offline + ' sem sinal');
    if (sim.state.status !== 'stopped') bits.push('simulação ' + (sim.state.status === 'running' ? 'em andamento' : 'pausada') + ' em ' + sensors[sim.state.sensorId].name);
    $('sit-sub').textContent = bits.join(' · ') + '.';
    $('sit-bar').innerHTML = ORDER.filter(k => cnt[k]).map(k => '<i data-level="' + k + '" style="flex-grow:' + cnt[k] + '"></i>').join('');
    $('counters').innerHTML = ORDER.filter(k => k !== 'offline' || cnt.offline).map(k => '<li data-level="' + k + '"><i></i><b>' + cnt[k] + '</b>' + L[k].label + '</li>').join('');
  }

  /* ---------- mapa ---------- */
  function renderMap() {
    map.refresh(list().map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon, levelKey: s.levelKey, levelLabel: L[s.levelKey].label })), selectedId);
  }
  function renderChip() {
    const chip = $('sel-chip'), s = sensors[selectedId];
    if (placeInfo && placeInfo.kind !== 'x' && !(placeInfo.sensors && placeInfo.sensors.length)) {
      $('sel-dot').parentNode.removeAttribute('data-level'); $('sel-name').textContent = placeInfo.name; $('sel-val').textContent = 'sem sensor'; return;
    }
    chip.setAttribute('data-level', s.levelKey); $('sel-name').textContent = s.name; $('sel-val').textContent = s.online ? Math.round(s.water) + ' cm' : 'sem sinal';
  }

  /* ---------- medidor ---------- */
  const gauge = (function () {
    const root = $('gauge'), X = 30, W = 32, Y0 = 10, H = 180, yOf = v => Y0 + H - v / 150 * H;
    let h = '<svg viewBox="0 0 92 210" role="img" aria-label="Medidor de nível da água"><defs><clipPath id="g-clip"><rect x="' + X + '" y="' + Y0 + '" width="' + W + '" height="' + H + '" rx="3"/></clipPath></defs>';
    h += '<rect class="g-tube" x="' + X + '" y="' + Y0 + '" width="' + W + '" height="' + H + '" rx="3"/><g clip-path="url(#g-clip)">';
    [['normal', 0, 30], ['attention', 30, 60], ['risk', 60, 90], ['flood', 90, 150]].forEach(b => { h += '<rect class="g-band" data-level="' + b[0] + '" x="' + X + '" y="' + yOf(b[2]) + '" width="' + W + '" height="' + (yOf(b[1]) - yOf(b[2])) + '"/>'; });
    h += '<g class="g-water" id="g-water"><rect x="' + X + '" y="' + Y0 + '" width="' + W + '" height="' + (H + 4) + '"/><path class="g-water-top" d="M' + X + ' ' + Y0 + 'q4 -3 8 0t8 0t8 0t8 0"/></g></g>';
    [0, 30, 60, 90, 150].forEach(v => { h += '<path class="g-tick" d="M' + (X - 6) + ' ' + yOf(v) + 'H' + X + '"/><text class="g-lbl" x="' + (X - 9) + '" y="' + (yOf(v) + 3.5) + '" text-anchor="end">' + v + '</text>'; });
    h += '<path class="g-ptr" id="g-ptr" d="M' + (X + W + 3) + ' 0l12 -7v14z"/></svg>';
    root.innerHTML = h;
    const water = root.querySelector('#g-water'), ptr = root.querySelector('#g-ptr');
    return { set(v, on) { const d = (1 - v / 150) * H; water.style.transform = 'translateY(' + d + 'px)'; water.style.opacity = on ? 1 : .25; ptr.style.transform = 'translateY(' + yOf(v) + 'px)'; ptr.style.opacity = on ? 1 : .35; } };
  })();

  /* ---------- sensor selecionado ---------- */
  function renderSensor() {
    const s = sensors[selectedId], lv = L[s.levelKey], inp = $('level');
    $('sensor-name').textContent = s.name; $('sensor-meta').textContent = s.city + ' · ' + s.landmark;
    const b = $('sensor-badge'); b.textContent = lv.label; b.setAttribute('data-level', s.levelKey);
    gauge.set(s.water, s.online);
    $('level-out').textContent = Math.round(s.water);
    $('sensor-text').textContent = s.online ? lv.text + ' (risco ' + lv.risk.toLowerCase() + ')' : 'Sensor sem comunicação. O último valor conhecido está esmaecido.';
    if (+inp.value !== Math.round(s.water)) inp.value = Math.round(s.water);
    inp.setAttribute('aria-valuetext', Math.round(s.water) + ' centímetros, ' + lv.label);
    $('f-source').innerHTML = '<span class="src" data-src="' + s.source + '">' + srcLabel(s.source) + '</span>';
    $('f-rain').textContent = s.online ? s.rain.toFixed(1).replace('.', ',') + ' mm/h' : '—';
    const rate = s.rate; $('f-rate').textContent = !s.online ? '—' : Math.abs(rate) < .5 ? 'estável' : (rate > 0 ? '+' : '−') + Math.abs(rate).toFixed(1).replace('.', ',') + ' cm/min';
    $('f-last').textContent = s.lastChange.text + ' · ' + ago(s.lastChange.t);
    const off = $('offline-toggle'); off.setAttribute('aria-pressed', String(!s.online)); off.querySelector('span').textContent = s.online ? 'Simular falha de sinal' : 'Restaurar sinal';
    const lock = false; document.querySelectorAll('.step').forEach(x => x.disabled = lock);
    if ($('more').open) renderMore(s);
  }
  function renderMore(s) {
    const h = s.history, W = 360, H = 130, pl = 28, pr = 6, pt = 8, pb = 16, n = Math.max(h.length, 2);
    const X = i => pl + (W - pl - pr) * i / (n - 1), Y = v => pt + (H - pt - pb) * (1 - v / 150);
    let g = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gráfico do nível nas últimas leituras">';
    [[30, 'normal'], [60, 'attention'], [90, 'risk']].forEach(t => { g += '<line class="ch-th" data-level="' + (t[1] === 'normal' ? 'attention' : t[1] === 'attention' ? 'risk' : 'flood') + '" style="stroke:var(--c)" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(t[0]) + '" y2="' + Y(t[0]) + '"/><text class="ch-t" x="' + (pl - 4) + '" y="' + (Y(t[0]) + 3) + '" text-anchor="end">' + t[0] + '</text>'; });
    g += '<line class="ch-grid" x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(0) + '" y2="' + Y(0) + '"/><text class="ch-t" x="' + (pl - 4) + '" y="' + (Y(0) + 3) + '" text-anchor="end">0</text>';
    const pts = h.map((p, i) => X(i).toFixed(1) + ',' + Y(p.w).toFixed(1));
    if (h.length > 1) g += '<polygon class="ch-area" points="' + pl + ',' + Y(0) + ' ' + pts.join(' ') + ' ' + X(h.length - 1).toFixed(1) + ',' + Y(0) + '"/><polyline class="ch-line" points="' + pts.join(' ') + '"/>';
    g += '</svg>'; $('chart').innerHTML = g;
    const rows = h.slice(-8).reverse().map(p => '<tr><td>' + clock(p.t) + '</td><td>' + Math.round(p.w) + ' cm</td><td>' + p.r.toFixed(1).replace('.', ',') + '</td><td>' + L[C.classify(p.w, true).key].label + '</td></tr>').join('');
    $('readings').innerHTML = '<table><thead><tr><th>Hora</th><th>Nível</th><th>mm/h</th><th>Faixa</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  /* ---------- rede ---------- */
  function buildNet() {
    $('regions-risk-list').innerHTML = list().map(s => '<li><button type="button" class="net-item" data-id="' + s.id + '"><i></i><span><b>' + esc(s.name) + '</b><small>' + esc(s.city) + '</small></span><span class="v"></span></button></li>').join('');
    $('net-count').textContent = list().length + ' sensores de demonstração';
  }
  function renderNet() {
    document.querySelectorAll('.net-item').forEach(b => {
      const s = sensors[b.dataset.id], lv = L[s.levelKey];
      b.setAttribute('data-level', s.levelKey); b.classList.toggle('is-selected', s.id === selectedId); b.setAttribute('aria-pressed', String(s.id === selectedId));
      b.setAttribute('aria-label', s.name + ', ' + lv.label + (s.online ? ', ' + Math.round(s.water) + ' centímetros' : ''));
      b.querySelector('.v').innerHTML = s.online ? Math.round(s.water) + ' <small>cm</small>' : '<small>' + lv.label + '</small>';
    });
  }

  /* ---------- alertas e avisos ---------- */
  function notify(ev) { toast(ev); renderAlerts(); }
  function toast(ev) {
    const box = $('toasts'); while (box.children.length >= 4) box.firstChild.remove();
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', ev.tone === 'flood' ? 'alert' : 'status'); t.setAttribute('data-level', ev.tone);
    t.innerHTML = icon(toneIcon(ev.tone)) + '<div><b>' + esc(ev.title) + '</b><span>' + esc(ev.text) + '</span></div><button type="button" class="x" aria-label="Fechar aviso">' + icon('i-x') + '</button>';
    let to = 0; const close = () => { clearTimeout(to); if (!t.parentNode) return; t.classList.add('out'); setTimeout(() => t.remove(), reduceMq.matches ? 0 : 260); };
    t.querySelector('.x').addEventListener('click', close); to = setTimeout(close, ev.tone === 'flood' ? 9000 : 6000); box.appendChild(t);
  }
  function renderAlerts() {
    const ol = $('alerts'), ev = alerts.events.filter(e => !dismissed.has(e.id));
    $('alerts-clear').hidden = !ev.length;
    if (!ev.length) { ol.innerHTML = '<li class="empty">Nenhum alerta ainda. Inicie a simulação ou mova o nível para ver os avisos aqui.</li>'; return; }
    ol.innerHTML = ev.slice(0, 12).map(e => '<li class="alert" data-level="' + e.tone + '" data-id="' + e.id + '">' + icon(toneIcon(e.tone)) + '<div><b>' + esc(e.title) + '</b><span>' + esc(e.text) + '</span><time>' + clock(e.t) + ' · ' + srcLabel(e.source).toLowerCase() + '</time></div><button type="button" class="x" aria-label="Dispensar alerta">' + icon('i-x') + '</button></li>').join('');
  }
  $('alerts').addEventListener('click', e => { const b = e.target.closest('.x'); if (!b) return; dismissed.add(b.closest('.alert').dataset.id); renderAlerts(); });
  $('alerts-clear').addEventListener('click', () => { alerts.events.forEach(e => dismissed.add(e.id)); renderAlerts(); });

  /* ---------- simulação ---------- */
  let chosenRain = C.CFG.rain.storm;
  function startTimer() { if (timer) return; lastT = performance.now(); timer = setInterval(onTick, C.CFG.tickMs); }
  function stopTimer() { if (timer) clearInterval(timer); timer = 0; }
  function onTick() { const now = performance.now(), dt = Math.min(now - lastT, 4000); lastT = now; sim.tick(dt, Date.now()); renderAll(); }
  function syncSim() {
    const st = sim.state, run = st.status === 'running', act = st.status !== 'stopped', s = act ? sensors[st.sensorId] : null;
    if (run) startTimer(); else stopTimer();
    // clima
    if (!act) weather.stop(); else { weather.setRain(s.targetRain); weather.setPaused(st.status === 'paused'); }
    const mw = $('map-weather'); mw.hidden = !act;
    if (act) $('map-weather-text').textContent = (st.status === 'paused' ? 'Pausada · ' : '') + rainWord(s.targetRain) + (s.targetRain > 0 ? ' · ' + s.targetRain + ' mm/h' : '') + ' sobre ' + s.name;
    // painel
    const pill = $('sim-state'); pill.setAttribute('data-state', st.status); pill.textContent = { stopped: 'Parada', running: 'Em andamento', paused: 'Pausada' }[st.status];
    const btn = $('demo'), lbl = { stopped: 'Iniciar simulação', running: 'Pausar', paused: 'Retomar' }[st.status];
    btn.querySelector('span').textContent = lbl; btn.querySelector('use').setAttribute('href', run ? '#i-pause' : '#i-play'); btn.setAttribute('data-mode', run ? 'pause' : 'play');
    $('sim-stop').disabled = !act; document.querySelectorAll('.scen .btn').forEach(b => b.disabled = !act);
    const target = act ? s : sensors[selectedId]; $('sim-sensor').textContent = (act ? 'Sensor simulado: ' : 'Será simulado em: ') + target.name;
    $('sim-hint').textContent = st.status === 'stopped' ? 'Escolha um sensor no mapa ou na lista e inicie para ver o nível subir com a chuva. Os valores são simulados.'
      : run ? 'Chuva simulada em andamento. Você pode escolher outro sensor para olhar, a simulação continua no sensor acima.'
      : 'Simulação pausada: chuva e nível ficam parados. Retome ou encerre quando quiser.';
    document.querySelectorAll('.seg button').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.rain === (act ? st.intensity : chosenRain))));
    renderSituation();
  }
  $('demo').addEventListener('click', () => {
    const st = sim.state.status;
    if (st === 'stopped') sim.start(selectedId, chosenRain, Date.now()); else if (st === 'running') sim.pause(); else sim.resume();
    renderAll();
  });
  $('sim-stop').addEventListener('click', () => { sim.stop(Date.now()); renderAll(); });
  document.querySelector('.seg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; chosenRain = +b.dataset.rain;
    if (sim.state.status !== 'stopped') sim.setIntensity(chosenRain, Date.now()); else syncSim();
    renderAll();
  });
  document.querySelector('.seg').addEventListener('keydown', e => {
    const bs = [...document.querySelectorAll('.seg button')], i = bs.indexOf(document.activeElement); if (i < 0) return;
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0; if (!d) return;
    e.preventDefault(); const nb = bs[(i + d + bs.length) % bs.length]; nb.focus(); nb.click();
  });
  document.querySelector('.scen').addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (!b || b.disabled) return; sim.scenario(b.dataset.action, Date.now()); renderAll(); });

  /* ---------- ajuste manual ---------- */
  function manual(v) {
    const s = sensors[selectedId], r = C.manualSet(sim, s, v, Date.now(), alerts);
    if (r.paused) toast({ tone: 'attention', title: 'Simulação pausada', text: 'Você mudou o nível de ' + s.name + ' à mão. Retome quando quiser.' });
    if (r.event) notify(r.event);
    syncSim(); renderAll();
  }
  const lvl = $('level'); lvl.addEventListener('input', () => manual(lvl.value));
  document.querySelector('.stepper').addEventListener('click', e => { const b = e.target.closest('[data-step]'); if (!b) return; const s = sensors[selectedId]; manual(C.clamp(Math.round(s.water) + (+b.dataset.step), C.CFG.min, C.CFG.max)); });
  $('level-reset').addEventListener('click', () => {
    const s = sensors[selectedId], now = Date.now();
    if (sim.state.status !== 'stopped' && sim.state.sensorId === s.id) sim.stop(now);
    s.water = s.base.water; s.rain = s.base.rain; s.targetRain = s.base.rain; s.online = s.base.online; s.source = 'demo'; s.drain = false; s.rate = 0; C.pushHistory(s, now);
    sim.refresh(s, false, now); syncSim(); renderAll();
  });
  $('offline-toggle').addEventListener('click', () => {
    const s = sensors[selectedId], now = Date.now();
    if (s.online && sim.state.status === 'running' && sim.state.sensorId === s.id) sim.pause();
    s.online = !s.online; if (!s.online) { s.rate = 0; s.rain = s.rain; } sim.refresh(s, false, now); syncSim(); renderAll();
  });
  $('more').addEventListener('toggle', () => { if ($('more').open) renderMore(sensors[selectedId]); });

  /* ---------- seleção ---------- */
  function selectSensor(id, focus) {
    if (!sensors[id]) return; selectedId = id; placeInfo = null;
    map.select(map.hostKeyOf(id)); if (focus) map.focusSensor(id, true);
    if (sim.state.status === 'stopped') syncSim(); renderAll();
  }
  $('regions-risk-list').addEventListener('click', e => { const b = e.target.closest('.net-item'); if (!b) return; selectSensor(b.dataset.id, true); if (window.innerWidth <= 900) $('map-card').scrollIntoView({ behavior: reduceMq.matches ? 'auto' : 'smooth', block: 'start' }); });
  $('sel-chip').addEventListener('click', () => $('sec-sensor').scrollIntoView({ behavior: reduceMq.matches ? 'auto' : 'smooth', block: 'start' }));

  /* ---------- busca ---------- */
  const sIn = $('search'), sOut = $('results'); let sItems = [], sIdx = -1;
  function runSearch() {
    const q = norm(sIn.value.trim()); sItems = []; sIdx = -1;
    if (q.length < 1) { closeSearch(); return; }
    list().forEach(s => { const hay = norm(s.name + ' ' + s.city + ' ' + s.landmark); if (hay.includes(q)) sItems.push({ t: 's', s }); });
    sItems = sItems.slice(0, 5);
    map.searchPlaces(sIn.value, 9).forEach(p => { if (sItems.length < 11) sItems.push({ t: 'p', p }); });
    sOut.innerHTML = sItems.length ? sItems.map((it, i) => it.t === 's'
      ? '<li role="option" id="r' + i + '" class="kind-s" data-i="' + i + '" data-level="' + it.s.levelKey + '"><i></i>' + esc(it.s.name) + '<small>Sensor</small></li>'
      : '<li role="option" id="r' + i + '" class="kind-p" data-i="' + i + '"><i></i>' + esc(it.p.name) + '<small>' + (it.p.kind === 'm' ? 'Cidade' : it.p.kind === 'b' ? 'Bairro' : 'Distrito') + '</small></li>').join('')
      : '<li class="none">Nada encontrado. Tente outro nome.</li>';
    sOut.hidden = false; sIn.setAttribute('aria-expanded', 'true');
  }
  function closeSearch() { sOut.hidden = true; sIn.setAttribute('aria-expanded', 'false'); sIn.removeAttribute('aria-activedescendant'); }
  function pick(i) {
    const it = sItems[i]; if (!it) return;
    if (it.t === 's') selectSensor(it.s.id, true);
    else { map.select(it.p.key); map.focusPlace(it.p.key, true); const pl = map.place(it.p.key), host = pl && pl.kind === 'b' ? map.place(pl.dist) : pl; if (host && host.sensors && host.sensors.length) selectSensor(host.sensors[0], false); else { placeInfo = host || pl; renderChip(); } }
    sIn.value = ''; closeSearch(); sIn.blur();
  }
  function mark() { [...sOut.children].forEach((li, i) => li.setAttribute('aria-selected', String(i === sIdx))); if (sIdx >= 0) { sIn.setAttribute('aria-activedescendant', 'r' + sIdx); const li = sOut.children[sIdx]; li && li.scrollIntoView({ block: 'nearest' }); } }
  sIn.addEventListener('input', runSearch); sIn.addEventListener('focus', () => { if (sIn.value) runSearch(); });
  sIn.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (sOut.hidden) runSearch(); sIdx = Math.min(sItems.length - 1, sIdx + 1); mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sIdx = Math.max(0, sIdx - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(sIdx >= 0 ? sIdx : 0); }
    else if (e.key === 'Escape') { sIn.value = ''; closeSearch(); }
  });
  sOut.addEventListener('mousedown', e => e.preventDefault()); sOut.addEventListener('click', e => { const li = e.target.closest('li[data-i]'); if (li) pick(+li.dataset.i); });
  document.addEventListener('click', e => { if (!e.target.closest('.search')) closeSearch(); });

  /* ---------- efeitos visuais ---------- */
  function fxState() {
    const off = store.get('alerta-sp-fx') === 'off'; document.documentElement.dataset.fx = off ? 'off' : 'on';
    weather.setQuality(off ? 'off' : 'auto'); const t = $('fx-toggle');
    if (reduceMq.matches) { $('fx-text').textContent = 'Seu aparelho pede menos movimento: chuva em imagem fixa, sem raios.'; t.disabled = true; t.textContent = 'Reduzido pelo aparelho'; t.setAttribute('aria-pressed', 'true'); return; }
    t.disabled = false; $('fx-text').textContent = off ? 'Efeitos reduzidos: chuva em imagem fixa, sem raios.' : 'Efeitos visuais completos (chuva e raios).';
    t.textContent = off ? 'Restaurar efeitos' : 'Reduzir efeitos'; t.setAttribute('aria-pressed', String(off));
  }
  $('fx-toggle').addEventListener('click', () => { store.set('alerta-sp-fx', store.get('alerta-sp-fx') === 'off' ? 'on' : 'off'); fxState(); syncSim(); });
  if (reduceMq.addEventListener) reduceMq.addEventListener('change', () => { fxState(); syncSim(); });

  /* ---------- tema ---------- */
  function curTheme() { return document.documentElement.dataset.theme || (window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
  function themeIcon() { $('theme').querySelector('use').setAttribute('href', curTheme() === 'dark' ? '#i-sun' : '#i-moon'); $('theme').setAttribute('aria-label', curTheme() === 'dark' ? 'Mudar para o tema claro' : 'Mudar para o tema escuro'); }
  $('theme').addEventListener('click', () => { const n = curTheme() === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = n; store.set('alerta-sp-theme', n); themeIcon(); });

  /* ---------- páginas ---------- */
  const ROUTES = { monitoramento: ['monitoring-panel', 'monitor-tab', 'Monitoramento'], reportar: ['report-panel', 'report-tab', 'Reportar ocorrência'], sobre: ['about-panel', 'about-tab', 'Sobre nós'] };
  function route() {
    const key = (location.hash || '#monitoramento').slice(1), r = ROUTES[key] || ROUTES.monitoramento;
    Object.values(ROUTES).forEach(v => { const on = v === r; $(v[0]).hidden = !on; const t = $(v[1]); t.classList.toggle('active', on); if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current'); });
    $('situation').hidden = r !== ROUTES.monitoramento; document.title = r[2] + ' · Alerta SP';
    if (r === ROUTES.monitoramento) {
      requestAnimationFrame(() => { map.relayout(); map.resetView(true); });
    } else window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- reportar ocorrência ---------- */
  const form = $('report-form'), fstat = $('form-status'), rlist = $('submitted-reports');
  const localReports = () => { try { return JSON.parse(store.get('alerta-sp-reports') || '[]'); } catch (_) { return []; } };
  function renderReports(rs) {
    if (!rs.length) { rlist.innerHTML = '<p class="empty">Nenhuma ocorrência enviada ainda.</p>'; return; }
    rlist.innerHTML = rs.map(r => { const sev = String(r.severity || '').split(' — ')[0], lv = sev === 'Crítica' || sev === 'Alta' ? 'flood' : sev === 'Média' ? 'risk' : 'attention';
      return '<article class="report" data-level="' + lv + '" style="--c:var(--' + lv + ')"><header><b>' + esc(r.type) + '</b><small>' + esc(r.time || '') + '</small></header><span>' + esc(r.location) + ' · ' + esc(sev) + '</span><p>' + esc(r.description || 'Sem descrição informada.') + '</p></article>'; }).join('');
  }
  async function loadReports() { try { const r = await fetch('/api/reports'); if (!r.ok) throw 0; renderReports(await r.json()); } catch (_) { renderReports(localReports()); } }
  function fstatus(msg, tone) { fstat.textContent = msg; fstat.setAttribute('data-tone', tone || ''); }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const f = { type: $('report-type'), severity: $('report-severity'), location: $('report-location'), description: $('report-description') }; let bad = null;
    Object.values(f).forEach(el => { const ok = el.value.trim() !== ''; el.setAttribute('aria-invalid', String(!ok)); if (!ok && !bad) bad = el; });
    if (bad) { fstatus('Preencha os campos marcados para enviar.', 'err'); bad.focus(); return; }
    const rep = { type: f.type.value, severity: f.severity.value, location: f.location.value.trim(), description: f.description.value.trim(), anonymous: $('report-anonymous').checked, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) };
    const fallback = [rep, ...localReports()].slice(0, 100); store.set('alerta-sp-reports', JSON.stringify(fallback)); fstatus('Enviando…', '');
    try { const r = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rep) }); if (!r.ok) throw 0; fstatus('Ocorrência enviada e compartilhada com os demais usuários.', 'ok'); await loadReports(); }
    catch (_) { renderReports(fallback); fstatus('Ocorrência salva só neste aparelho (o servidor não respondeu).', 'ok'); }
    form.reset(); $('report-anonymous').checked = true;
  });
  form.addEventListener('input', e => { if (e.target.getAttribute('aria-invalid') === 'true' && e.target.value.trim()) e.target.setAttribute('aria-invalid', 'false'); });

  /* ---------- desenhar tudo ---------- */
  function renderAll() { renderSituation(); renderMap(); renderChip(); renderSensor(); renderNet(); }
  buildNet(); fxState(); themeIcon(); route(); renderAlerts(); loadReports();
  map.select(map.hostKeyOf(selectedId)); syncSim(); renderAll();
  // atualiza "há X s" sem mexer em mais nada
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderAll(); });

  // ganchos para testes automáticos
  window.__alerta = { sensors, sim, alerts, weather, map, select: selectSensor, timerActive: () => !!timer, state: () => ({ selectedId, timer: !!timer, status: sim.state.status }) };
})();
