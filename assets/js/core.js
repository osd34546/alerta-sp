/* Alerta SP — núcleo de regras (sem tela).
 * FONTE ÚNICA dos limites de risco, da simulação e dos alertas. Tudo no site lê daqui.
 * Escala: nível da água em centímetros (cm), de 0 a 150. Limites preservados do projeto original:
 *   Normal ≤ 30 · Atenção ≤ 60 · Risco ≤ 90 · Alagamento > 90.
 * Não são limites hidrológicos oficiais: são os valores definidos pela equipe para a demonstração.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AlertaCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CFG = {
    unit: 'cm', min: 0, max: 150, step: 1,
    tickMs: 1200,            // intervalo da simulação
    refTickMs: 1800,         // intervalo original: as taxas abaixo são "por 1800 ms"
    hysteresis: 2,           // cm de folga ao DESCER durante a simulação (evita alertas em vai-e-vem)
    alertCooldownMs: 6000,   // mesmo sensor + mesmo nível não repete dentro deste prazo
    rain: { light: 8, heavy: 45, storm: 55 },
    levels: [
      { key: 'normal',    max: 30,       label: 'Normal',     rank: 0, color: '#3c9a6b', risk: 'Baixo',         text: 'Nível da água dentro da faixa normal.' },
      { key: 'attention', max: 60,       label: 'Atenção',    rank: 1, color: '#e0a800', risk: 'Moderado',      text: 'Nível elevado. Acompanhe a evolução.' },
      { key: 'risk',      max: 90,       label: 'Risco',      rank: 2, color: '#e5701a', risk: 'Alto',          text: 'Nível de risco elevado. Monitore as condições.' },
      { key: 'flood',     max: Infinity, label: 'Alagamento', rank: 3, color: '#d03a2c', risk: 'Crítico',       text: 'Nível crítico atingido.' }
    ],
    offline: { key: 'offline', label: 'Sem sinal', rank: -1, color: '#7d8a86', risk: 'Indeterminado', text: 'Sensor sem comunicação.' }
  };
  const LEVEL = Object.fromEntries(CFG.levels.concat(CFG.offline).map(l => [l.key, l]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /** Classificação única. `sticky` aplica a folga ao descer (só em simulação). */
  function classify(water, online, prevKey, sticky) {
    if (!online) return CFG.offline;
    const w = Number.isFinite(water) ? water : 0;
    let lv = CFG.levels.find(l => w <= l.max);
    if (sticky && prevKey && LEVEL[prevKey] && LEVEL[prevKey].rank > lv.rank && LEVEL[prevKey].rank >= 0) {
      const prev = LEVEL[prevKey], floor = CFG.levels[prev.rank - 1].max; // limite inferior do nível anterior
      if (w > floor - CFG.hysteresis) lv = prev;
    }
    return lv;
  }

  // Sensores de demonstração (valores originais do projeto). Nenhum é um aparelho físico conectado.
  const SEED = [
    { id: 'pinheiros', name: 'Pinheiros', city: 'São Paulo', lat: -23.567, lon: -46.692, water: 8, rain: 1, online: true, landmark: 'Rio Pinheiros · Marginal Pinheiros' },
    { id: 'anhangabau', name: 'Anhangabaú', city: 'São Paulo · Centro', lat: -23.545, lon: -46.639, water: 80, rain: 12, online: true, landmark: 'Vale do Anhangabaú · Viaduto do Chá' },
    { id: 'lapa', name: 'Lapa', city: 'São Paulo', lat: -23.523, lon: -46.704, water: 5, rain: 1, online: true, landmark: 'Estação e Mercado da Lapa' },
    { id: 'santo-amaro', name: 'Santo Amaro', city: 'São Paulo', lat: -23.6549, lon: -46.7147, water: 50, rain: 9, online: true, landmark: 'Largo 13 · Terminal Santo Amaro' },
    { id: 'ipiranga', name: 'Ipiranga', city: 'São Paulo', lat: -23.5875, lon: -46.6086, water: 3, rain: 0, online: true, landmark: 'Museu do Ipiranga · Parque da Independência' },
    { id: 'mooca', name: 'Mooca', city: 'São Paulo', lat: -23.559, lon: -46.599, water: 10, rain: 2, online: true, landmark: 'Rua da Mooca · galpões históricos' },
    { id: 'vila-prudente', name: 'Vila Prudente', city: 'São Paulo', lat: -23.583, lon: -46.58, water: 0, rain: 0, online: false, landmark: 'Estação Vila Prudente · monotrilho' },
    { id: 'butanta', name: 'Butantã', city: 'São Paulo', lat: -23.571, lon: -46.722, water: 6, rain: 1, online: true, landmark: 'Instituto Butantan · Cidade Universitária' },
    { id: 'tatuape', name: 'Tatuapé', city: 'São Paulo', lat: -23.54, lon: -46.576, water: 4, rain: 1, online: true, landmark: 'Parque Piqueri · Radial Leste' },
    { id: 'santana', name: 'Santana', city: 'São Paulo', lat: -23.5, lon: -46.628, water: 3, rain: 2, online: true, landmark: 'Santana · Expo Center Norte' },
    { id: 'interlagos', name: 'Interlagos', city: 'São Paulo', lat: -23.681, lon: -46.675, water: 40, rain: 8, online: true, landmark: 'Autódromo José Carlos Pace' },
    { id: 'guarulhos', name: 'Guarulhos', city: 'Guarulhos', lat: -23.4628, lon: -46.5333, water: 12, rain: 2, online: true, landmark: 'Aeroporto Internacional de Guarulhos' },
    { id: 'osasco', name: 'Osasco', city: 'Osasco', lat: -23.5325, lon: -46.7917, water: 5, rain: 1, online: true, landmark: 'Centro de Osasco · Calçadão' },
    { id: 'santo-andre', name: 'Santo André', city: 'Santo André', lat: -23.6737, lon: -46.5432, water: 8, rain: 1, online: true, landmark: 'Paço Municipal · Parque Central' },
    { id: 'sao-bernardo', name: 'São Bernardo', city: 'São Bernardo do Campo', lat: -23.6914, lon: -46.5646, water: 10, rain: 1, online: true, landmark: 'Paço Municipal · Avenida Kennedy' },
    { id: 'taboao', name: 'Taboão da Serra', city: 'Taboão da Serra', lat: -23.6091, lon: -46.7917, water: 7, rain: 1, online: true, landmark: 'Rodovia Régis Bittencourt · Centro' },
    { id: 'maua', name: 'Mauá', city: 'Mauá', lat: -23.6677, lon: -46.4614, water: 6, rain: 1, online: true, landmark: 'Estação Mauá · Paço Municipal' }
  ];

  function createSensor(seed, now) {
    const t = now || Date.now();
    return Object.assign({}, seed, {
      base: { water: seed.water, rain: seed.rain, online: seed.online },
      targetRain: seed.rain, source: 'demo',        // demo | sim | manual | real
      levelKey: classify(seed.water, seed.online).key,
      rate: 0, drain: false, last: t,
      lastChange: { t, text: 'Leitura inicial de demonstração' },
      history: [{ t, w: seed.water, r: seed.rain }]
    });
  }

  function pushHistory(s, t) { s.history.push({ t, w: s.water, r: s.rain }); if (s.history.length > 40) s.history.shift(); }
  function levelOf(s, sticky) { return classify(s.water, s.online, s.levelKey, sticky); }

  /** Avança um sensor `dtMs` milissegundos. `rng` é injetável para testes. Só chamado em simulação ativa. */
  function stepSensor(s, dtMs, rng) {
    const r = rng || Math.random, f = dtMs / CFG.refTickMs, before = s.water;
    if (!s.online) return;
    if (s.drain) { s.water = clamp(s.water - 7 * f, CFG.min, CFG.max); if (s.water < 3) s.drain = false; }
    else s.water = clamp(s.water + (s.targetRain * 0.06 - (0.2 + 0.005 * s.water) + (r() - 0.5) * 0.5) * f, CFG.min, CFG.max);
    s.rain = Math.max(0, s.rain + (s.targetRain - s.rain) * Math.min(1, 0.4 * f * 1.5) + (r() - 0.5) * s.targetRain * 0.07 * f);
    if (s.targetRain === 0 && s.rain < 0.05) s.rain = 0;
    s.rate = (s.water - before) * 60000 / dtMs;
  }

  /** Alertas: emite só em TRANSIÇÃO de nível, com intervalo mínimo por sensor+nível. */
  function createAlertCenter() {
    const events = [], lastEmit = new Map();
    return {
      events,
      /** devolve o evento ou null (sem duplicar). */
      record(s, fromKey, toKey, now) {
        if (!fromKey || fromKey === toKey) return null;
        const t = now || Date.now(), k = s.id + ':' + toKey, prev = lastEmit.get(k);
        if (prev !== undefined && t - prev < CFG.alertCooldownMs) return null;
        lastEmit.set(k, t);
        const to = LEVEL[toKey], from = LEVEL[fromKey];
        let title, text, tone = to.key;
        if (toKey === 'offline') { title = 'Sensor sem sinal'; text = s.name + ' perdeu comunicação.'; }
        else if (fromKey === 'offline') { title = 'Sensor online'; text = s.name + ' voltou a se comunicar.'; }
        else if (to.rank > from.rank) { title = to.key === 'flood' ? 'Nível crítico' : 'Nível subiu: ' + to.label; text = s.name + ' — ' + Math.round(s.water) + ' cm. ' + to.text; }
        else { title = 'Nível baixou: ' + to.label; text = s.name + ' — ' + Math.round(s.water) + ' cm. ' + to.text; tone = to.key; }
        const ev = { id: t + '-' + events.length, t, sensorId: s.id, from: fromKey, to: toKey, title, text, tone, source: s.source, escalated: (to.rank > (from.rank)) };
        events.unshift(ev); if (events.length > 40) events.pop();
        return ev;
      },
      clear() { events.length = 0; lastEmit.clear(); }
    };
  }

  /** Máquina de estados da simulação (parada → em execução ⇄ pausada → parada). Vinculada a UM sensor. */
  function createSimulation(getSensor, alerts, hooks) {
    const h = Object.assign({ onChange() {}, onAlert() {} }, hooks);
    const sim = { status: 'stopped', sensorId: null, intensity: CFG.rain.storm, startedAt: 0, ticks: 0 };

    function refresh(s, sticky, now) {
      const prev = s.levelKey, lv = levelOf(s, sticky);
      if (lv.key !== prev) {
        s.levelKey = lv.key; s.lastChange = { t: now, text: LEVEL[prev].label + ' → ' + lv.label };
        const ev = alerts.record(s, prev, lv.key, now); if (ev) h.onAlert(ev, s);
      }
      return lv;
    }
    const bound = () => sim.sensorId ? getSensor(sim.sensorId) : null;

    const api = {
      state: sim,
      refresh,
      start(sensorId, intensity, now) {
        const t = now || Date.now(), s = getSensor(sensorId); if (!s) return false;
        if (sim.status !== 'stopped' && sim.sensorId !== sensorId) api.stop(t);
        const wasOffline = !s.online; s.online = true;
        if (wasOffline) refresh(s, false, t);
        sim.status = 'running'; sim.sensorId = sensorId; sim.startedAt = t; sim.ticks = 0;
        if (intensity !== undefined) sim.intensity = intensity;
        s.source = 'sim'; s.targetRain = sim.intensity; s.drain = false;
        h.onChange(sim); return true;
      },
      setIntensity(mm, now) { const s = bound(); sim.intensity = mm; if (s && sim.status !== 'stopped') { s.targetRain = mm; s.drain = false; s.source = 'sim'; } h.onChange(sim); },
      pause() { if (sim.status !== 'running') return false; sim.status = 'paused'; h.onChange(sim); return true; },
      resume() { const s = bound(); if (sim.status !== 'paused' || !s) return false; sim.status = 'running'; s.source = 'sim'; h.onChange(sim); return true; },
      /** Encerrar: política original do projeto — nível e chuva do sensor voltam a 0. */
      stop(now) {
        const t = now || Date.now(), s = bound();
        if (s) { s.targetRain = 0; s.rain = 0; s.water = 0; s.rate = 0; s.drain = false; s.source = 'demo'; pushHistory(s, t); refresh(s, false, t); }
        sim.status = 'stopped'; sim.sensorId = null; h.onChange(sim);
      },
      /** Cenários rápidos aplicados ao sensor da simulação. */
      scenario(name, now) {
        const t = now || Date.now(), s = bound(); if (!s || sim.status === 'stopped') return false;
        if (sim.status === 'paused') api.resume();
        s.source = 'sim';
        if (name === 'light') api.setIntensity(CFG.rain.light);
        else if (name === 'heavy') api.setIntensity(CFG.rain.heavy);
        else if (name === 'storm') api.setIntensity(CFG.rain.storm);
        else if (name === 'raise') { s.water = clamp(s.water + 15, CFG.min, CFG.max); pushHistory(s, t); refresh(s, false, t); }
        else if (name === 'flood') { s.online = true; s.water = 105; sim.intensity = CFG.rain.storm; s.targetRain = CFG.rain.storm; pushHistory(s, t); refresh(s, false, t); }
        else if (name === 'normal') { sim.intensity = 0; s.targetRain = 0; s.drain = true; }
        h.onChange(sim); return true;
      },
      /** Passo de tempo: único ponto que altera o nível durante a simulação. */
      tick(dtMs, now, rng) {
        if (sim.status !== 'running') return false;
        const t = now || Date.now(), s = bound(); if (!s) return false;
        stepSensor(s, dtMs, rng); s.last = t; sim.ticks++;
        pushHistory(s, t); refresh(s, true, t); return true;
      }
    };
    return api;
  }

  /** Ajuste manual do nível. Se a simulação estiver rodando NESTE sensor, ela é pausada de forma explícita. */
  function manualSet(sim, s, value, now, alerts) {
    const t = now || Date.now(); let paused = false;
    if (sim && sim.state.status === 'running' && sim.state.sensorId === s.id) { sim.pause(); paused = true; }
    const v = clamp(Math.round(Number(value)), CFG.min, CFG.max);
    s.online = true; s.water = Number.isFinite(v) ? v : s.water; s.source = 'manual'; s.drain = false; s.last = t; s.rate = 0;
    pushHistory(s, t);
    const prev = s.levelKey, lv = levelOf(s, false);
    if (lv.key !== prev) { s.levelKey = lv.key; s.lastChange = { t, text: LEVEL[prev].label + ' → ' + lv.label }; const ev = alerts ? alerts.record(s, prev, lv.key, t) : null; return { paused, event: ev }; }
    return { paused, event: null };
  }

  return { CFG, LEVEL, SEED, clamp, classify, createSensor, stepSensor, levelOf, pushHistory, createAlertCenter, createSimulation, manualSet };
});
