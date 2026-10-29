/* Alerta SP — clima sobre o mapa: nuvens, chuva em duas camadas, ondulações no chão e raios.
 * Regras: não bloqueia cliques (a camada ignora o mouse); para totalmente ao encerrar (sem timers: só um
 * requestAnimationFrame enquanto há chuva); respeita "reduzir movimento" com alternativa estática. */
(function (root) {
  'use strict';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const mq = q => root.matchMedia && root.matchMedia(q);

  function create(layer, opts) {
    opts = opts || {};
    layer.textContent = '';
    const mk = (cls, tag) => { const e = document.createElement(tag || 'div'); e.className = cls; layer.appendChild(e); return e; };
    mk('fx-tint'); const clouds = mk('fx-clouds'); for (let i = 0; i < 4; i++) { const c = document.createElement('i'); clouds.appendChild(c); }
    // A camada CSS deixa as gotas claramente visíveis mesmo quando o canvas é acelerado por hardware de forma diferente.
    const rain = mk('fx-rain');
    const canvas = mk('fx-canvas', 'canvas'), flash = mk('fx-flash'); mk('fx-static');
    const ctx = canvas.getContext('2d', { alpha: true });
    const rm = mq('(prefers-reduced-motion: reduce)');
    const S = {
      target: 0, intensity: 0, raf: 0, last: 0, w: 0, h: 0, dpr: 1, paused: false, active: false,
      quality: 'auto', scale: (root.innerWidth < 720 || (navigator.hardwareConcurrency || 8) <= 4) ? .55 : 1,
      drops: [], ripples: [], bolts: [], nextBolt: 0, anims: new Set(), frames: 0, slow: 0, wind: 0
    };
    const MAX = 340;
    function mode() { return S.quality === 'off' || (rm && rm.matches) ? 'static' : 'canvas'; }

    function resize() {
      const r = layer.getBoundingClientRect(); S.w = r.width; S.h = r.height;
      S.dpr = Math.min(root.devicePixelRatio || 1, S.scale < 1 ? 1 : 1.5);
      canvas.width = Math.max(1, Math.round(S.w * S.dpr)); canvas.height = Math.max(1, Math.round(S.h * S.dpr));
      ctx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0);
      if (!S.drops.length) for (let i = 0; i < MAX; i++) { const far = Math.random() < .55; S.drops.push({ x: Math.random(), y: Math.random(), far, v: far ? rand(820, 1120) : rand(1350, 1900), l: far ? rand(8, 15) : rand(16, 30), a: far ? rand(.16, .3) : rand(.3, .55) }); }
    }
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null; ro && ro.observe(layer); resize();

    function setVar() {
      const rainLevel = clamp(S.intensity, 0, 1);
      const stormLevel = clamp((S.target - .62) / .38, 0, 1);
      layer.style.setProperty('--fx', rainLevel.toFixed(3));
      layer.style.setProperty('--rain-speed', (0.82 - rainLevel * .58).toFixed(2) + 's');
      layer.style.setProperty('--bolt-strength', (0.48 + stormLevel * .52).toFixed(2));
    }
    function needLoop() { return mode() === 'canvas' && !document.hidden && ((!S.paused && S.target > 0) || S.intensity > .004 || S.bolts.length || S.ripples.length); }
    function ensureLoop() { if (!S.raf && needLoop()) { S.last = performance.now(); S.raf = requestAnimationFrame(frame); } }

    function strike(now) {
      const w = S.w, h = S.h, x0 = rand(w * .12, w * .88), x1 = x0 + rand(-w * .08, w * .08), y1 = rand(h * .38, h * .82);
      const path = (ax, ay, bx, by, disp, depth) => { let p = [[ax, ay], [bx, by]]; for (let d = 0; d < depth; d++) { const n = []; for (let i = 0; i < p.length - 1; i++) { const a = p[i], b = p[i + 1], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, o = (Math.random() - .5) * disp; n.push(a, [mx - dy / L * o, my + dx / L * o]); } n.push(p[p.length - 1]); p = n; disp *= .55; } return p; };
      const main = path(x0, -10, x1, y1, h * .16, 6), branches = [];
      for (let i = 0, n = 1 + (Math.random() * 2 | 0); i < n; i++) { const o = main[(main.length * rand(.25, .7)) | 0]; branches.push(path(o[0], o[1], o[0] + rand(-w * .1, w * .1), o[1] + rand(h * .1, h * .28), h * .06, 5)); }
      S.bolts.push({ t0: now, main, branches, life: 520 });
      // clarão com intensidade controlada, centrado no ponto do raio
      const px = (x1 / w * 100).toFixed(0), py = (y1 / h * 100).toFixed(0);
      flash.style.background = 'radial-gradient(ellipse at ' + px + '% ' + py + '%, rgba(225,238,255,.95) 0%, rgba(170,200,240,.42) 32%, rgba(120,150,200,0) 72%)';
      if (flash.animate) {
        try {
          const a = flash.animate([{ opacity: 0 }, { opacity: .55, offset: .06 }, { opacity: .08, offset: .2 }, { opacity: .36, offset: .3 }, { opacity: 0 }], { duration: 620, easing: 'ease-out' });
          S.anims.add(a); a.onfinish = a.oncancel = () => S.anims.delete(a);
        } catch (_) { flash.classList.add('is-flashing'); }
      } else {
        flash.classList.remove('is-flashing'); void flash.offsetWidth; flash.classList.add('is-flashing');
      }
      opts.onLightning && opts.onLightning();
    }

    function frame(now) {
      S.raf = 0; if (!needLoop()) { clearCanvas(); return; }
      const dt = Math.min((now - S.last) / 1000, .05); S.last = now;
      // governador de desempenho: se estiver lento, reduz partículas
      S.frames++; if (dt > .034) S.slow++; if (S.frames === 40) { if (S.slow > 14 && S.scale > .3) S.scale = Math.max(.3, S.scale * .7); S.frames = 0; S.slow = 0; }
      // suaviza a intensidade (transições entre condições)
      const goal = S.paused ? 0 : S.target, rate = goal > S.intensity ? .45 : .6;
      S.intensity += clamp(goal - S.intensity, -rate * dt, rate * dt); if (Math.abs(goal - S.intensity) < .003) S.intensity = goal;
      setVar();
      const w = S.w, h = S.h, I = S.intensity; ctx.clearRect(0, 0, w, h);
      S.wind = Math.sin(now / 5200) * .08 + .26; // inclinação com leves rajadas
      const n = Math.floor(MAX * S.scale * Math.pow(I, .9));
      for (let layerFar = 1; layerFar >= 0; layerFar--) {
        ctx.lineWidth = layerFar ? .8 : 1.35; ctx.lineCap = 'round'; ctx.beginPath(); let any = false;
        for (let i = 0; i < n; i++) {
          const d = S.drops[i]; if ((d.far ? 1 : 0) !== layerFar) continue;
          const rainSpeed = .55 + I * .75; d.y += d.v * rainSpeed * dt / h; d.x += d.v * S.wind * rainSpeed * dt / w; if (d.y > 1.04) { d.y = -.05; d.x = Math.random() * 1.1 - .1; spawn(d); } if (d.x > 1.05) d.x -= 1.15;
          const x = d.x * w, y = d.y * h; ctx.moveTo(x, y); ctx.lineTo(x - d.l * S.wind, y - d.l); any = true;
        }
        if (any) { ctx.strokeStyle = layerFar ? 'rgba(200,222,240,' + (.22 * Math.min(1, I * 1.3)).toFixed(3) + ')' : 'rgba(225,238,250,' + (.5 * Math.min(1, I * 1.2)).toFixed(3) + ')'; ctx.stroke(); }
      }
      // ondulações onde a chuva toca o chão
      ctx.lineWidth = 1;
      for (let i = S.ripples.length - 1; i >= 0; i--) {
        const r = S.ripples[i], a = (now - r.t) / r.life; if (a >= 1) { S.ripples.splice(i, 1); continue; }
        ctx.strokeStyle = 'rgba(205,228,245,' + ((1 - a) * .38 * Math.min(1, I * 1.4)).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(r.x, r.y, 2 + a * r.r, (2 + a * r.r) * .42, 0, 0, 6.283); ctx.stroke();
      }
      if (!S.paused && S.target > 0 && S.ripples.length < 34 * S.scale) { const c = Math.random() < I * 24 * dt ? 1 : 0; for (let i = 0; i < c; i++) S.ripples.push({ x: Math.random() * w, y: Math.random() * h, r: rand(9, 20), life: rand(520, 900), t: now }); }
      // raios: só com chuva forte e sem pausa
      if (!S.paused && S.target >= .62 && I > .5 && S.quality !== 'low') { if (!S.nextBolt) S.nextBolt = now + rand(700, 1500); if (now > S.nextBolt) { strike(now); S.nextBolt = now + rand(3200, 7000) / (.6 + S.target * .6); } } else S.nextBolt = 0;
      for (let i = S.bolts.length - 1; i >= 0; i--) {
        const b = S.bolts[i], a = (now - b.t0) / b.life; if (a >= 1) { S.bolts.splice(i, 1); continue; }
        const env = a < .08 ? 1 : a < .18 ? .25 : a < .3 ? .9 : Math.max(0, .5 * (1 - (a - .3) / .7));
        const power = .48 + clamp((S.target - .62) / .38, 0, 1) * .52;
        const draw = (pts, k) => { ctx.beginPath(); pts.forEach((p, j) => j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(150,185,255,' + (.14 * env * k * power).toFixed(3) + ')'; ctx.lineWidth = 9 * k; ctx.stroke(); ctx.strokeStyle = 'rgba(190,215,255,' + (.4 * env * k * power).toFixed(3) + ')'; ctx.lineWidth = 3.2 * k; ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,' + (.95 * env * power).toFixed(3) + ')'; ctx.lineWidth = 1.5 * k; ctx.stroke(); };
        draw(b.main, 1); b.branches.forEach(br => draw(br, .55));
      }
      ensureLoop();
    }
    function spawn(d) { if (!d.far && !S.paused && S.ripples.length < 30 * S.scale && Math.random() < .12) S.ripples.push({ x: Math.random() * S.w, y: Math.random() * S.h, r: rand(8, 16), life: rand(500, 800), t: performance.now() }); }
    function clearCanvas() { ctx.clearRect(0, 0, S.w, S.h); }
    function cancelAll() { cancelAnimationFrame(S.raf); S.raf = 0; S.anims.forEach(a => { try { a.cancel(); } catch (_) { } }); S.anims.clear(); S.bolts.length = 0; S.ripples.length = 0; S.nextBolt = 0; flash.classList.remove('is-flashing'); flash.style.background = ''; clearCanvas(); }

    function apply() {
      const m = mode(); layer.setAttribute('data-mode', m);
      layer.classList.toggle('is-wet', S.target > 0 && !S.paused); layer.classList.toggle('is-paused', S.paused && S.target > 0); layer.classList.toggle('is-storm', S.target >= .62 && !S.paused);
      if (m === 'static') { cancelAll(); S.intensity = S.paused ? 0 : S.target; setVar(); return; }
      if (S.target === 0 && S.intensity <= .004 && !S.bolts.length) { cancelAll(); S.intensity = 0; setVar(); return; }
      ensureLoop();
    }
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(S.raf); S.raf = 0; } else ensureLoop(); };
    document.addEventListener('visibilitychange', onVis);
    if (rm && rm.addEventListener) rm.addEventListener('change', () => { cancelAll(); apply(); });

    return {
      /** mm/h do sensor simulado (0 = céu limpo). Chuva fraca ≈ 8, forte ≈ 45, temporal ≈ 55. */
      setRain(mm) { const value = Number(mm); S.target = clamp(Number.isFinite(value) ? value / 55 : 0, 0, 1); apply(); },
      setPaused(p) { S.paused = !!p; apply(); },
      setQuality(q) { S.quality = q; cancelAll(); apply(); },
      stop() { S.target = 0; S.paused = false; S.intensity = 0; cancelAll(); setVar(); apply(); },
      state() { return { mode: mode(), raf: !!S.raf, intensity: +S.intensity.toFixed(3), target: +S.target.toFixed(3), paused: S.paused, bolts: S.bolts.length, ripples: S.ripples.length, anims: S.anims.size, scale: S.scale }; },
      destroy() { cancelAll(); ro && ro.disconnect(); document.removeEventListener('visibilitychange', onVis); }
    };
  }
  root.AlertaWeather = { create };
})(window);
