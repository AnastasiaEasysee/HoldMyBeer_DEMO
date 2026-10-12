// DOM side of the phone view: tutorial, HUD, buttons, toasts, results.
(function () {
  const C = HMB.CONFIG;
  const $ = (id) => document.getElementById(id);
  const ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  HMB.ordinal = ordinal;

  const UI = {
    cache: {},

    init(G) {
      this.G = G;
      this.el = {
        hud: $('hud'), beers: $('beer-count'), beerPill: $('hud-beers'), score: $('score'), rank: $('rank'),
        timer: $('hud-timer'), timerFill: $('timer-fill'), timerText: $('timer-text'), effects: $('effects'),
        toasts: $('toasts'), action: $('btn-action'), actionLabel: $('action-label'), actionSub: $('action-sub'),
        actionCd: $('action-cd'), throwBtn: $('btn-throw'), glassCount: $('glass-count'), aimHint: $('aim-hint'),
        balance: $('balance'), bubble: $('bubble'), hitFlash: $('hit-flash'), countdown: $('countdown'),
        intro: $('screen-intro'), results: $('screen-results'),
      };

      // How many AI rivals
      const seg = $('rivals-seg');
      const setRivals = (n) => {
        n = Math.max(0, Math.min(C.bots.length, Math.round(n) || 0));
        seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.n) === n)));
        G.setRivals(n);
        $('rival-names').innerHTML = n
          ? 'Playing against ' + C.bots.slice(0, n).map((b) => `<b style="color:${hex(b.shirt)}">${b.name}</b>`).join(', ')
          : 'Solo practice: just you, the customers and the clock.';
        try { localStorage.setItem('hmb-rivals', String(n)); } catch (_) { /* ignore */ }
      };
      seg.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) setRivals(Number(b.dataset.n));
      });
      let rivals = C.bots.length;
      try {
        const s = localStorage.getItem('hmb-rivals');
        if (s !== null && s !== '') rivals = Number(s);
      } catch (_) { /* ignore */ }
      setRivals(rivals);

      this.setupTweaks();

      // Controls choice
      const tiltBtn = $('mode-tilt'), stickBtn = $('mode-stick');
      const setMode = (m) => {
        HMB.Input.mode = m;
        tiltBtn.setAttribute('aria-checked', String(m === 'tilt'));
        stickBtn.setAttribute('aria-checked', String(m === 'stick'));
        $('mode-note').textContent = m === 'tilt'
          ? 'Hold the phone how you like. That angle counts as level when the round starts.'
          : 'The joystick walks. Push further to go faster.';
      };
      tiltBtn.addEventListener('click', () => setMode('tilt'));
      stickBtn.addEventListener('click', () => setMode('stick'));
      // HMB.noTilt: set by hosts that block motion sensors
      setMode(!HMB.noTilt && HMB.Input.tiltLikely() ? 'tilt' : 'stick');

      try {
        const saved = localStorage.getItem('hmb-name');
        if (saved) $('player-name').value = saved;
      } catch (_) { /* storage unavailable */ }

      $('btn-start').addEventListener('click', async () => {
        HMB.Audio.init();
        const name = ($('player-name').value || '').trim().slice(0, 12) || 'You';
        try { localStorage.setItem('hmb-name', name); } catch (_) { /* ignore */ }
        this.phoneMode();
        if (HMB.Input.mode === 'tilt') {
          const ok = await HMB.Input.requestTilt();
          if (!ok) setMode('stick');
        }
        G.start(name);
      });
      $('btn-again').addEventListener('click', () => { HMB.Audio.init(); this.phoneMode(); G.restart(); });
      $('btn-settings').addEventListener('click', () => {
        G.toIntro();
        this.el.intro.scrollTop = 0;
      });

      // The screen wake lock is dropped when the tab is hidden; take it back on return
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && this.wantWake) this.keepAwake();
      });

      // Action button: fires on touch-down for responsiveness
      this.el.action.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.el.action.classList.add('pressed');
        G.doAction();
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
        this.el.action.addEventListener(ev, () => this.el.action.classList.remove('pressed')));

      // Throw button: hold to aim, swipe up to throw, let go to cancel
      const tb = this.el.throwBtn;
      this.throwPtr = null;
      tb.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (G.state !== 'playing' || G.human.glasses <= 0) return;
        try { tb.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        this.throwPtr = { id: e.pointerId, y0: e.clientY };
        G.startAim();
      });
      tb.addEventListener('pointermove', (e) => {
        const p = this.throwPtr;
        if (!p || p.id !== e.pointerId) return;
        const dy = p.y0 - e.clientY;
        tb.style.setProperty('--lift', Math.max(0, Math.min(dy, 50)) + 'px');
        if (dy > C.throwSwipePx) {
          this.throwPtr = null;
          tb.style.setProperty('--lift', '0px');
          G.releaseThrow();
        }
      });
      const endThrow = (e) => {
        const p = this.throwPtr;
        if (!p || p.id !== e.pointerId) return;
        this.throwPtr = null;
        tb.style.setProperty('--lift', '0px');
        G.cancelAim();
      };
      tb.addEventListener('pointerup', endThrow);
      tb.addEventListener('pointercancel', endThrow);

      // Keyboard: Space = action (or throw while aiming), hold F = aim
      addEventListener('keydown', (e) => {
        if (e.repeat || (e.target && e.target.tagName === 'INPUT')) return;
        if (G.state !== 'playing') return;
        if (e.code === 'Space') { if (G.aim) G.releaseThrow(); else G.doAction(); }
        if (e.code === 'KeyF' && G.human.glasses > 0) G.startAim();
      });
      addEventListener('keyup', (e) => { if (e.code === 'KeyF' && G.aim) G.cancelAim(); });

      // Double-tap the level to recalibrate tilt
      let lastTap = 0;
      this.el.balance.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const now = performance.now();
        if (now - lastTap < 350 && HMB.Input.usingTilt()) {
          HMB.Input.calibrate();
          this.toast('Tilt recalibrated', '');
        }
        lastTap = now;
      });
    },

    // "Tweak the numbers": one number field per entry in HMB.SETTINGS, saved in this browser
    setupTweaks() {
      const clampN = (v, a, b) => Math.max(a, Math.min(b, v));
      const fmt = (v, step) => {
        const d = (String(step).split('.')[1] || '').length;
        return String(parseFloat(Number(v).toFixed(d)));
      };
      let saved = {};
      try { saved = JSON.parse(localStorage.getItem('hmb-settings') || '{}') || {}; } catch (_) { saved = {}; }

      const list = $('tweak-list');
      const rows = [];
      HMB.SETTINGS.forEach((grp) => {
        const sec = document.createElement('div');
        sec.className = 'tweak-group';
        const h = document.createElement('h3');
        h.textContent = grp.group;
        sec.appendChild(h);
        grp.items.forEach(([key, label, min, max, step]) => {
          if (typeof saved[key] === 'number' && isFinite(saved[key])) C[key] = clampN(saved[key], min, max);
          const row = document.createElement('div');
          row.className = 'tweak-row';
          const lab = document.createElement('label');
          lab.htmlFor = 'tw-' + key;
          lab.textContent = label;
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.id = 'tw-' + key;
          inp.min = min; inp.max = max; inp.step = step;
          inp.inputMode = step < 1 ? 'decimal' : 'numeric';
          inp.value = fmt(C[key], step);
          const mark = () => row.classList.toggle('changed', C[key] !== HMB.DEFAULTS[key]);
          const commit = (final) => {
            const v = parseFloat(inp.value);
            if (!isFinite(v)) { if (final) inp.value = fmt(C[key], step); return; }
            C[key] = clampN(v, min, max);
            if (final) inp.value = fmt(C[key], step);
            mark();
            this.saveTweaks();
          };
          inp.addEventListener('input', () => commit(false));
          inp.addEventListener('change', () => commit(true));
          mark();
          rows.push({ key, step, inp, mark });
          row.append(lab, inp);
          sec.appendChild(row);
        });
        list.appendChild(sec);
      });

      $('tweak-reset').addEventListener('click', () => {
        rows.forEach((r) => {
          C[r.key] = HMB.DEFAULTS[r.key];
          r.inp.value = fmt(C[r.key], r.step);
          r.mark();
        });
        this.saveTweaks();
      });
      this.saveTweaks();
    },

    saveTweaks() {
      const changed = {};
      HMB.SETTINGS.forEach((g) => g.items.forEach(([k]) => { if (C[k] !== HMB.DEFAULTS[k]) changed[k] = C[k]; }));
      try { localStorage.setItem('hmb-settings', JSON.stringify(changed)); } catch (_) { /* ignore */ }
      const n = Object.keys(changed).length;
      $('tweak-count').textContent = n ? `(${n} changed)` : '';
    },

    // On phones: go fullscreen, stay in portrait and keep the screen on (tilt play rarely touches it).
    // Must run inside a tap. Every step is optional; iPhones skip fullscreen.
    phoneMode() {
      const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
      if (!touch) return;
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        el.requestFullscreen({ navigationUI: 'hide' })
          .then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('portrait'))
          .catch(() => {});
      }
      this.wantWake = true;
      this.keepAwake();
    },

    keepAwake() {
      if (!('wakeLock' in navigator)) return;
      navigator.wakeLock.request('screen').catch(() => {});
    },

    setMode(mode) {
      this.el.hud.classList.toggle('mode-tilt', mode === 'tilt');
      this.el.hud.classList.toggle('mode-stick', mode !== 'tilt');
    },

    showIntro(show) { this.el.intro.hidden = !show; },
    showHUD(show) { this.el.hud.hidden = !show; },

    toast(text, kind) {
      const t = document.createElement('div');
      t.className = 'toast ' + (kind || '');
      t.textContent = text;
      this.el.toasts.appendChild(t);
      while (this.el.toasts.children.length > 3) this.el.toasts.firstChild.remove();
      setTimeout(() => t.remove(), 1850);
    },

    countdown(text, go) {
      const el = this.el.countdown;
      el.hidden = !text;
      if (!text) return;
      el.innerHTML = '';
      const s = document.createElement('span');
      s.textContent = text;
      if (go) s.className = 'go';
      el.appendChild(s);
    },

    hitFlash() {
      const f = this.el.hitFlash;
      f.classList.add('on');
      requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
    },

    bumpBeers() {
      const p = this.el.beerPill;
      p.classList.add('bump');
      setTimeout(() => p.classList.remove('bump'), 140);
    },

    set(key, val, fn) {
      if (this.cache[key] === val) return;
      this.cache[key] = val;
      fn(val);
    },

    update(G) {
      const h = G.human, el = this.el;
      this.set('beers', h.beers, (v) => { el.beers.textContent = v; el.beerPill.classList.toggle('full', v >= C.maxBeers); });
      this.set('score', h.score, (v) => { el.score.textContent = v; });

      const sorted = G.standings();
      const rank = sorted.indexOf(h) + 1;
      this.set('rank', rank + '/' + G.chars.length, () => {
        el.rank.textContent = G.chars.length > 1 ? `${ordinal(rank)} of ${G.chars.length}` : 'Solo';
      });

      const frac = 1 - Math.max(0, G.remaining) / C.matchSeconds;
      this.set('timerFill', Math.round(frac * 400), () => {
        el.timerFill.style.strokeDashoffset = String(113.1 * (1 - frac));
      });
      const secs = Math.ceil(Math.max(0, G.remaining));
      this.set('timer', secs, (v) => {
        el.timerText.textContent = `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
        el.timer.classList.toggle('low', v <= 10);
      });

      // Effects
      const fx = [];
      if (h.fallT > 0) fx.push(['dazed', 'In the cellar']);
      if (h.stunT > 0) fx.push(['dazed', 'Dazed']);
      if (h.onSticky && h.fallT <= 0) fx.push(['sticky', 'Sticky floor']);
      if (h.isSafe() && C.barSafeDistance > 0 && G.chars.length > 1) fx.push(['safe', 'Safe zone']);
      if (h.boostT > 0) fx.push(['boost', `Speed ${Math.ceil(h.boostT)}s`]);
      if (h.shieldT > 0) fx.push(['shield', `Shield ${Math.ceil(h.shieldT)}s`]);
      if (h.drunkT > 0) fx.push(['dizzy', `Seeing double ${Math.ceil(h.drunkT)}s`]);
      this.set('fx', fx.map((f) => f[1]).join('|'), () => {
        el.effects.innerHTML = fx.map(([k, t]) => `<span class="chip ${k}">${t}</span>`).join('');
      });

      // Action button
      const a = G.currentAction();
      this.set('aLabel', a.label, (v) => { el.actionLabel.textContent = v; });
      this.set('aSub', a.sub || '', (v) => { el.actionSub.textContent = v; });
      this.set('aOn', a.enabled, (v) => { el.action.classList.toggle('off', !v); });
      this.set('aCd', Math.round((a.cd || 0) * 60), () => {
        el.actionCd.style.strokeDashoffset = String(289 * (1 - (a.cd || 0)));
      });

      // Throw button
      this.set('glasses', h.glasses, (v) => {
        el.throwBtn.hidden = v <= 0;
        el.glassCount.textContent = v;
      });
      this.set('aiming', !!G.aim, (v) => {
        el.throwBtn.classList.toggle('aiming', v);
        el.aimHint.hidden = !v;
      });

      // Balance level: shows where the tray is pulling you (screen right = +x, screen down = +z)
      const k = 26;
      const bx = Math.max(-20, Math.min(20, h.sway.x * k)), by = Math.max(-20, Math.min(20, h.sway.z * k));
      el.bubble.style.transform = `translate(${bx.toFixed(1)}px, ${by.toFixed(1)}px)`;
      const wob = Math.hypot(h.sway.x, h.sway.z);
      this.set('wob', wob > 0.45 ? 2 : wob > 0.2 ? 1 : 0, (v) => {
        el.balance.classList.toggle('wobbly', v === 1);
        el.balance.classList.toggle('tipsy', v === 2);
      });
    },

    showResults(G) {
      const list = G.standings();
      const h = G.human;
      const rank = list.indexOf(h) + 1;
      const solo = list.length === 1;
      $('result-title').textContent = solo ? 'Round over' : rank === 1 ? 'You win!' : rank === 2 ? 'So close!' : 'Better luck next round';
      $('result-rank').textContent = solo ? h.score : ordinal(rank);
      $('result-rank').nextElementSibling.textContent = solo ? 'points' : 'place';
      $('standings').hidden = solo;
      $('result-score').textContent = h.score;
      const ol = $('standings');
      ol.innerHTML = '';
      list.forEach((c, i) => {
        const li = document.createElement('li');
        if (c === h) li.className = 'me';
        li.innerHTML = `<span class="pos">${i + 1}</span><span class="dot" style="background:${hex(c.color)}"></span><span class="nm"></span><span class="pts">${c.score}</span>`;
        li.querySelector('.nm').textContent = c === h && c.name.toLowerCase() !== 'you' ? `${c.name} (you)` : c.name;
        ol.appendChild(li);
      });
      this.el.results.hidden = false;
    },

    hideResults() { this.el.results.hidden = true; },
  };

  HMB.UI = UI;
})();
