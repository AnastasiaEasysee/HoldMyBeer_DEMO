// Main loop: rules, collisions, hazards, effects, camera and rendering for the phone view.
(function () {
  const C = HMB.CONFIG;
  const A = HMB.Audio;
  const I = HMB.Input;
  const UI = HMB.UI;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const G = {
    state: 'boot',        // intro -> countdown -> playing -> results
    time: 0,
    remaining: C.matchSeconds,
    chars: [],
    bots: [],
    human: null,
    fx: [],
    target: null,
    shake: 0,
    drunkAmt: 0,
    countdownT: 0,
    lastCount: null,
  };
  HMB.G = G;

  // ------------------------------------------------------------ setup
  function init() {
    const canvas = document.getElementById('game');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    G.renderer = renderer;

    G.scene = new THREE.Scene();
    G.scene.background = new THREE.Color(0x140d09);
    G.scene.fog = new THREE.Fog(0x140d09, 30, 60);
    G.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 120);
    G.camPos = new THREE.Vector3(0, 22, 33);
    G.camLook = new THREE.Vector3(0, 0, 17);

    G.world = HMB.buildWorld(G.scene);
    G.nav = new HMB.NavGrid();

    const sp = HMB.MAP.spawns;
    G.human = new HMB.Character(G, { name: 'You', isHuman: true, shirt: C.humanColor, pants: 0x2a3550, hair: 0x4a2a14, x: sp[0].x, z: sp[0].z });
    G.human.spawn = sp[0];
    G.allBots = C.bots.map((b, i) => {
      const c = new HMB.Character(G, Object.assign({}, b, { x: sp[i + 1].x, z: sp[i + 1].z }));
      c.spawn = sp[i + 1];
      return new HMB.BotBrain(G, c, b);
    });
    G.setRivals(C.bots.length);

    // Throw fan: shows which way you're facing and how far a glass reaches
    G.fanMat = new THREE.MeshBasicMaterial({ color: 0xf4a72c, transparent: true, opacity: 0.12, depthWrite: false });
    G.fan = new THREE.Mesh(new THREE.BufferGeometry(), G.fanMat);
    G.fan.position.y = 0.02;
    G.fan.renderOrder = 2;
    G.fan.visible = false;
    G.scene.add(G.fan);
    G.applyConfig();

    setupPost();
    I.init();
    UI.init(G);
    resize();
    addEventListener('resize', resize);
    if (window.visualViewport) visualViewport.addEventListener('resize', resize);

    G.state = 'intro';
    G.last = performance.now();
    requestAnimationFrame(loop);
  }

  // Everyone who moves: players and walking customers
  G.movers = function () { return G.chars.concat(G.world.walkers); };

  // How many AI rivals play (0–3). Unused rivals are hidden and skipped.
  G.setRivals = function (n) {
    n = clamp(Math.round(n), 0, G.allBots.length);
    G.bots = G.allBots.slice(0, n);
    G.chars = [G.human].concat(G.bots.map((b) => b.c));
    G.allBots.forEach((b, i) => {
      const on = i < n;
      b.c.fig.root.visible = on;
      if (!on) { b.c.reset(b.c.spawn.x, b.c.spawn.z); b.c.fig.root.visible = false; b.reset(); }
    });
  };

  // Re-read numbers that shape geometry (after the start-screen settings change)
  G.applyConfig = function () {
    const cone = C.throwAimConeDeg * Math.PI / 180;
    const geo = new THREE.CircleGeometry(C.throwRange, 32, -cone, cone * 2);
    geo.rotateX(-Math.PI / 2);
    G.fan.geometry.dispose();
    G.fan.geometry = geo;
    G.world.applyConfig();
    G.human.beers = Math.min(G.human.beers, C.maxBeers);
  };

  // Double-vision post effect (only rendered while you are tipsy)
  function setupPost() {
    G.rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
    G.postScene = new THREE.Scene();
    G.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    G.postMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: G.rt.texture }, amount: { value: 0 }, time: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float amount; uniform float time; varying vec2 vUv;
        void main(){
          vec2 wob = amount * vec2(sin(vUv.y * 9.0 + time * 2.3) * 0.005, cos(vUv.x * 7.0 + time * 1.7) * 0.003);
          vec2 off = amount * vec2(0.03 * sin(time * 1.6), 0.014 * cos(time * 1.1));
          vec4 a = texture2D(tDiffuse, vUv + wob);
          vec4 b = texture2D(tDiffuse, vUv + wob + off);
          vec4 col = mix(a, b, 0.45 * amount);
          float v = smoothstep(0.9, 0.35, length(vUv - 0.5));
          col.rgb *= mix(1.0, 0.75 + 0.25 * v, amount);
          gl_FragColor = col;
        }`,
      depthTest: false,
      depthWrite: false,
    });
    G.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), G.postMat));
  }

  function resize() {
    const stage = document.getElementById('stage');
    const w = stage.clientWidth, h = stage.clientHeight;
    G.renderer.setSize(w, h, false);
    const aspect = w / h;
    G.camera.aspect = aspect;
    // Keep a usable horizontal view on a tall portrait screen
    const hfov = 64 * Math.PI / 180;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180 / Math.PI;
    G.camera.fov = clamp(vfov, 50, 84);
    G.camera.updateProjectionMatrix();
    const v = G.renderer.getDrawingBufferSize(new THREE.Vector2());
    G.rt.setSize(v.x, v.y);
  }

  // ------------------------------------------------------------ flow
  G.start = function (name) {
    G.human.name = name;
    G.applyConfig();
    UI.showIntro(false);
    G.restart();
  };

  // Back to the start screen (to change settings or rivals)
  G.toIntro = function () {
    UI.hideResults();
    UI.showHUD(false);
    resetMatch();
    G.state = 'intro';
    UI.showIntro(true);
  };

  G.restart = function () {
    UI.hideResults();
    resetMatch();
    UI.setMode(I.mode === 'tilt' ? 'tilt' : 'stick');
    UI.showHUD(true);
    UI.update(G);
    G.state = 'countdown';
    G.countdownT = C.countdownSeconds + 0.6;
    G.lastCount = null;
  };

  function resetMatch() {
    G.chars.forEach((c) => c.reset(c.spawn.x, c.spawn.z));
    G.bots.forEach((b) => b.reset());
    G.world.resetWalkers();
    G.fx.forEach((f) => f.dispose && f.dispose());
    G.fx = [];
    G.clearTarget();
    HMB.MAP.tables.forEach((t) => { t.cooldownT = 0; });
    G.remaining = C.matchSeconds;
    G.drunkAmt = 0;
    G.shake = 0;
    G.tiltWarned = false;
    I.releaseAll();
    snapCamera();
  }

  function endMatch() {
    G.state = 'results';
    G.clearTarget();
    A.play('whistle');
    UI.showHUD(false);
    UI.showResults(G);
  }

  G.standings = function () {
    return G.chars.slice().sort((a, b) => b.score - a.score || (a.isHuman ? -1 : b.isHuman ? 1 : 0));
  };

  G.notify = function (text, kind) {
    if (G.state === 'playing') UI.toast(text, kind);
  };

  // Play a sound for something a character did; rivals far away are quieter.
  function sfx(c, name) {
    if (G.state !== 'playing') return;
    if (c.isHuman) { A.play(name, 1); return; }
    const d = Math.hypot(c.x - G.human.x, c.z - G.human.z);
    const v = Math.max(0, 0.7 - d / 20);
    if (v > 0.05) A.play(name, v);
  }

  // ------------------------------------------------------------ actions (shared by you and the AI)
  G.servableTable = function (c) {
    let best = null, bd = 1e9;
    for (const t of HMB.MAP.tables) {
      const d = Math.hypot(c.x - t.x, c.z - t.z) - t.r - c.radius;
      if (d <= C.serveReach && d < bd) { bd = d; best = t; }
    }
    return best;
  };

  G.tryGetBeer = function (c) {
    if (c.stunT > 0 || c.fallT > 0 || !c.inBarZone() || c.getCd > 0 || c.beers >= C.maxBeers) return false;
    c.beers++;
    c.getCd = C.getBeerCooldown;
    sfx(c, 'getBeer');
    if (c.isHuman) UI.bumpBeers();
    return true;
  };

  G.tryServe = function (c, table) {
    const t = table || G.servableTable(c);
    if (!t || c.beers <= 0 || c.stunT > 0 || c.fallT > 0 || t.cooldownT > 0) return false;
    const pts = c.beers * t.points;
    c.score += pts;
    if (C.tableCooldownEnabled) t.cooldownT = C.tableCooldownSeconds;
    c.stats.served += c.beers;
    c.stats.biggest = Math.max(c.stats.biggest, c.beers);
    serveFx(c, t, c.beers, pts);
    c.beers = 0;
    sfx(c, 'serve');
    if (c.isHuman) UI.toast(`+${pts}`, 'big');
    return true;
  };

  G.tryDrink = function (c) {
    if (!c.canDrink() || c.fallT > 0) return false;
    c.beers--;
    c.stats.drinks++;
    c.drinkCd = C.drinkCooldown;
    c.drunkT = C.drunkSeconds;
    c.boostT = C.boostSeconds;
    c.setShield(C.drinkShieldSeconds, 'drink');
    c.glasses = Math.min(C.maxGlasses, c.glasses + 1);
    sfx(c, 'drink');
    if (c.isHuman) UI.toast('Cheers! Speed boost, shield and a glass to throw', 'good');
    return true;
  };

  G.throwGlass = function (c, target) {
    if (c.glasses <= 0 || c.stunT > 0 || c.fallT > 0 || !target || target.fallT > 0 || target.isSafe()) return false;
    if (Math.hypot(target.x - c.x, target.z - c.z) > C.throwRange) return false;
    c.glasses--;
    projectileFx(c, target);
    sfx(c, 'throw');
    return true;
  };

  function onGlassHit(from, target, mesh) {
    const live = G.state === 'playing';
    if (target.fallT > 0) {
      shatterFx(mesh.position.x, 0.06, mesh.position.z, false);
      return;
    }
    if (target.isSafe()) {
      // Made it back to the bar before the glass landed
      sfx(target, 'blocked');
      shatterFx(mesh.position.x, 0.06, mesh.position.z, false);
      if (live && target.isHuman) UI.toast('Safe at the bar!', 'good');
      else if (live && from.isHuman) UI.toast(`${target.name} is safe at the bar`, 'warn');
      return;
    }
    if (target.shieldT > 0) {
      target.stats.blocks++;
      sfx(target, 'blocked');
      if (live && target.isHuman) UI.toast(`Your shield blocked ${from.name}'s glass`, 'good');
      else if (live && from.isHuman) UI.toast(`${target.name}'s shield blocked it`, 'warn');
      shatterFx(mesh.position.x, mesh.position.y, mesh.position.z, false);
      return;
    }
    // The thrower scores for every beer the target was carrying
    const pts = Math.round(target.beers * C.hitPointsPerBeer);
    from.score += pts;
    if (live && pts > 0) floatText(`+${pts}`, target.x, target.z, from.isHuman ? '#6fcf7b' : '#f4a72c');
    target.stunT = C.stunSeconds;
    target.vx *= 0.2;
    target.vz *= 0.2;
    const lost = Math.min(C.beersLostOnHit, target.beers);
    from.stats.hitsLanded++;
    target.stats.hitsTaken++;
    target.stats.lost += lost;
    if (lost > 0) dropBeersFx(target, lost);
    target.beers -= lost;
    target.setShield(C.hitShieldSeconds, 'hit');
    shatterFx(mesh.position.x, mesh.position.y, mesh.position.z, false);
    sfx(target, 'loseBeers');
    if (!live) return;
    const s = lost === 1 ? '' : 's';
    if (target.isHuman) {
      UI.hitFlash();
      G.shake = 0.45;
      UI.toast(`${from.name} hit you! −${lost} beer${s}` + (pts ? `, +${pts} for them` : ''), 'bad');
      vibrate(120);
    } else if (from.isHuman) {
      UI.toast(pts ? `Hit ${target.name}! +${pts} points` : `Hit ${target.name}, but their tray was empty`, 'good');
    }
  }

  function vibrate(ms) {
    if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) {
      try { navigator.vibrate(ms); } catch (_) { /* ignore */ }
    }
  }

  // What the big button does right now
  G.currentAction = function () {
    const h = G.human;
    if (h.fallT > 0) return { kind: 'none', label: 'Climbing', sub: 'out of the cellar', enabled: false };
    if (h.stunT > 0) return { kind: 'none', label: 'Dazed', sub: '', enabled: false };
    if (h.inBarZone()) {
      if (h.beers >= C.maxBeers) return { kind: 'none', label: 'Tray full', sub: `${h.beers}/${C.maxBeers}`, enabled: false };
      return { kind: 'pour', label: 'Pouring', sub: `${h.beers}/${C.maxBeers}`, enabled: true, cd: h.getCd / Math.max(0.01, C.getBeerCooldown) };
    }
    const t = G.servableTable(h);
    if (t && h.beers > 0 && t.cooldownT > 0) return { kind: 'none', label: 'Serve', sub: `table busy ${Math.ceil(t.cooldownT)}s`, enabled: false, cd: t.cooldownT / Math.max(0.01, C.tableCooldownSeconds) };
    if (t && h.beers > 0) return { kind: 'serve', label: 'Serve', sub: `+${h.beers * t.points} pts`, enabled: true };
    if (h.beers > 0) {
      if (h.barDistance() < C.drinkMinBarDistance) return { kind: 'none', label: 'Drink', sub: 'too close to bar', enabled: false };
      if (h.drinkCd > 0) return { kind: 'drink', label: 'Drink', sub: `${Math.ceil(h.drinkCd)}s`, enabled: false, cd: h.drinkCd / C.drinkCooldown };
      return { kind: 'drink', label: 'Drink', sub: 'boost + shield', enabled: true };
    }
    return { kind: 'none', label: 'Get Beer', sub: 'go to the bar', enabled: false };
  };

  G.doAction = function () {
    if (G.state !== 'playing') return;
    const a = G.currentAction();
    let ok = false;
    if (a.kind === 'pour') return;   // the bar pours on its own, nothing to tap
    else if (a.kind === 'serve') ok = G.tryServe(G.human);
    else if (a.kind === 'drink') ok = G.tryDrink(G.human);
    if (!ok) A.play('deny');
  };

  // ------------------------------------------------------------ throwing (you): face your target, tap Throw
  // While you carry a glass, G.target is the rival inside your facing fan (highlighted every frame).
  G.throwNow = function () {
    if (G.state !== 'playing') return;
    const h = G.human;
    if (h.glasses <= 0 || h.stunT > 0 || h.fallT > 0) { A.play('deny'); return; }
    const t = pickTarget();
    if (t) G.throwGlass(h, t);
    else if (G.safeOnly) { UI.toast('They\'re safe near the bar', 'warn'); A.play('deny'); }
    else { UI.toast(`Turn towards a rival within ${C.throwRange} m`, 'warn'); A.play('deny'); }
  };

  G.clearTarget = function () {
    G.target = null;
    G.chars.forEach((c) => { c.ring.visible = false; });
  };

  // Target = the rival in range closest to the direction your character faces
  function pickTarget() {
    const h = G.human;
    const fx = Math.sin(h.facing), fz = Math.cos(h.facing);
    const cone = Math.cos(C.throwAimConeDeg * Math.PI / 180);
    let best = null, bd = -1, safeSeen = false;
    for (const c of G.chars) {
      if (c === h || c.fallT > 0) continue;
      const dx = c.x - h.x, dz = c.z - h.z, d = Math.hypot(dx, dz);
      if (d > C.throwRange || d < 0.01) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot <= cone) continue;
      if (c.isSafe()) { safeSeen = true; continue; }
      if (dot > bd) { bd = dot; best = c; }
    }
    G.safeOnly = !best && safeSeen;
    return best;
  }

  function updateTargeting() {
    const h = G.human;
    const live = G.state === 'playing' && h.fallT <= 0 && h.glasses > 0;
    // The fan shows whenever you hold a glass; it turns red when a rival is lined up
    G.fan.visible = live;
    if (!live) { if (G.target !== null) G.clearTarget(); return; }
    G.fan.position.x = h.x;
    G.fan.position.z = h.z;
    G.fan.rotation.y = h.facing - Math.PI / 2;
    const best = pickTarget();
    G.target = best;
    G.fanMat.opacity = best ? 0.22 + Math.sin(G.time * 8) * 0.05 : 0.12;
    G.fanMat.color.setHex(best ? 0xe5533d : 0xf4a72c);
    G.chars.forEach((c) => {
      c.ring.visible = c === best;
      if (c === best) {
        c.ringMat.color.setHex(c.shieldT > 0 ? 0xbfb3a0 : 0xe5533d);
        c.ring.scale.setScalar(1 + Math.sin(G.time * 10) * 0.08);
      }
    });
  }

  // ------------------------------------------------------------ effects
  function addFx(f) { G.fx.push(f); return f; }
  function removeMesh(m) { if (m.parent) m.parent.remove(m); }

  function trayWorldPos(c) {
    const v = new THREE.Vector3();
    c.fig.tray.getWorldPosition(v);
    return v;
  }

  function serveFx(c, t, n, pts) {
    const from = trayWorldPos(c);
    const shown = Math.min(n, 20);
    for (let i = 0; i < shown; i++) {
      const pint = HMB.makePint(false);
      G.scene.add(pint);
      const a = (i / shown) * Math.PI * 2 + rand(0, 0.4);
      const rr = t.r * rand(0.35, 0.7);
      const to = new THREE.Vector3(t.x + Math.cos(a) * rr, t.topY, t.z + Math.sin(a) * rr);
      const start = from.clone().add(new THREE.Vector3(rand(-0.15, 0.15), 0, rand(-0.15, 0.15)));
      const dur = 0.35 + i * 0.05;
      let time = 0;
      addFx({
        update(dt) {
          time += dt;
          const k = Math.min(1, time / dur);
          pint.position.lerpVectors(start, to, k);
          pint.position.y += Math.sin(k * Math.PI) * 0.6;
          if (time > dur + 1.4) pint.scale.setScalar(Math.max(0.001, 1 - (time - dur - 1.4) * 3));
          return time < dur + 1.75;
        },
        dispose() { removeMesh(pint); },
      });
    }
    floatText(`+${pts}`, t.x, t.z, '#f4a72c');
  }

  function floatText(text, x, z, color) {
    const label = HMB.textSprite(text, { height: 0.9, size: 72, color, stroke: '#241409', strokeWidth: 12, pad: 20, depthTest: false, renderOrder: 40 });
    label.position.set(x, 2.4, z);
    G.scene.add(label);
    let lt = 0;
    addFx({
      update(dt) {
        lt += dt;
        label.position.y = 2.4 + lt * 1.4;
        label.material.opacity = Math.max(0, 1 - Math.max(0, lt - 0.7) * 1.6);
        return lt < 1.35;
      },
      dispose() { removeMesh(label); label.material.map.dispose(); label.material.dispose(); },
    });
  }

  function dropBeersFx(c, n) {
    const from = trayWorldPos(c);
    for (let i = 0; i < n; i++) {
      const pint = HMB.makePint(false);
      pint.position.copy(from).add(new THREE.Vector3(rand(-0.2, 0.2), 0.05, rand(-0.2, 0.2)));
      G.scene.add(pint);
      const v = new THREE.Vector3(rand(-2, 2), rand(1.5, 3), rand(-2, 2));
      const spin = new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9));
      let alive = true;
      addFx({
        update(dt) {
          v.y -= 12 * dt;
          pint.position.addScaledVector(v, dt);
          pint.rotation.x += spin.x * dt;
          pint.rotation.z += spin.z * dt;
          if (pint.position.y <= 0.05) {
            shatterFx(pint.position.x, 0.06, pint.position.z, true);
            alive = false;
          }
          return alive;
        },
        dispose() { removeMesh(pint); },
      });
    }
  }

  function shatterFx(x, y, z, puddle) {
    const shards = [];
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(HMB.GEO.shard, HMB.MAT.shard);
      m.position.set(x, y, z);
      G.scene.add(m);
      shards.push({ m, v: new THREE.Vector3(rand(-2.5, 2.5), rand(1, 3), rand(-2.5, 2.5)) });
    }
    let t = 0;
    addFx({
      update(dt) {
        t += dt;
        shards.forEach((s) => {
          s.v.y -= 12 * dt;
          s.m.position.addScaledVector(s.v, dt);
          if (s.m.position.y < 0.02) { s.m.position.y = 0.02; s.v.set(s.v.x * 0.4, 0, s.v.z * 0.4); }
          s.m.rotation.x += dt * 8;
        });
        return t < 0.9;
      },
      dispose() { shards.forEach((s) => removeMesh(s.m)); },
    });
    if (puddle) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xd99a2a, transparent: true, opacity: 0.6, depthWrite: false });
      const p = new THREE.Mesh(HMB.GEO.puddle, mat);
      p.position.set(x, 0.016, z);
      p.scale.setScalar(0.2);
      G.scene.add(p);
      let pt = 0;
      addFx({
        update(dt) {
          pt += dt;
          p.scale.setScalar(Math.min(1, 0.2 + pt * 3));
          mat.opacity = 0.6 * Math.max(0, 1 - Math.max(0, pt - 2.5) / 1.5);
          return pt < 4;
        },
        dispose() { removeMesh(p); mat.dispose(); },
      });
    }
  }

  function projectileFx(c, target) {
    const glass = HMB.makePint(true);
    const start = new THREE.Vector3(c.x, 1.55, c.z);
    glass.position.copy(start);
    glass.scale.setScalar(1.6);   // a bit bigger so it reads from above
    G.scene.add(glass);
    const dist = Math.hypot(target.x - c.x, target.z - c.z);
    const dur = 0.18 + dist / 14;
    let t = 0;
    addFx({
      update(dt) {
        t += dt;
        const k = Math.min(1, t / dur);
        // Homes in on where the target is now
        glass.position.set(
          start.x + (target.x - start.x) * k,
          start.y + (1.35 - start.y) * k + Math.sin(k * Math.PI) * 0.9,
          start.z + (target.z - start.z) * k);
        glass.rotation.x += dt * 14;
        glass.rotation.z += dt * 9;
        if (k >= 1) { onGlassHit(c, target, glass); return false; }
        return true;
      },
      dispose() { removeMesh(glass); },
    });
  }

  function updateFx(dt) {
    for (let i = G.fx.length - 1; i >= 0; i--) {
      const f = G.fx[i];
      if (!f.update(dt)) {
        if (f.dispose) f.dispose();
        G.fx.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------ physics and hazards
  function bump(c, impact, nx, nz) {
    if (impact < 0.7) return;
    c.knockT = C.knockSeconds;
    c.stagger(impact, nx, nz);
    if (c.bumpCd <= 0) {
      c.bumpCd = 0.3;
      sfx(c, 'bounce');
      if (c.isHuman) {
        if (impact > 2) G.shake = Math.max(G.shake, 0.18);
        vibrate(40);
      }
    }
  }

  // Bounce c off something along normal n (pointing from the thing to c).
  // ovx/ovz: the other thing's velocity (0 for furniture).
  function bounceOff(c, nx, nz, ovx, ovz) {
    const vn = (c.vx - ovx) * nx + (c.vz - ovz) * nz;
    if (vn >= 0) return;
    const push = C.bumpImpulse * Math.min(1, -vn / 2);
    c.vx += (-(1 + C.bounce) * vn + push) * nx;
    c.vz += (-(1 + C.bounce) * vn + push) * nz;
    bump(c, -vn, nx, nz);
  }

  // Stop moving into something without bouncing (the bar counter and bar stools)
  function slideAlong(c, nx, nz) {
    const vn = c.vx * nx + c.vz * nz;
    if (vn < 0) { c.vx -= vn * nx; c.vz -= vn * nz; }
  }

  function collide() {
    const RM = C.room;
    const walkers = G.world.walkers;
    for (const c of G.chars) {
      if (c.fallT > 0) continue;
      const r = c.radius;
      // furniture and standing customers
      for (const o of HMB.obstacles) {
        const dx = c.x - o.x, dz = c.z - o.z;
        const d = Math.hypot(dx, dz), min = r + o.r;
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d;
          c.x = o.x + nx * min;
          c.z = o.z + nz * min;
          if (o.soft) slideAlong(c, nx, nz);
          else bounceOff(c, nx, nz, 0, 0);
        }
      }
      // walking customers don't budge, they shove you aside
      for (const w of walkers) {
        const dx = c.x - w.x, dz = c.z - w.z;
        const d = Math.hypot(dx, dz), min = r + w.r;
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d;
          c.x = w.x + nx * min;
          c.z = w.z + nz * min;
          bounceOff(c, nx, nz, w.vx, w.vz);
        }
      }
      // walls and the bar counter
      if (c.x < RM.minX + r) { c.x = RM.minX + r; if (c.vx < 0) bounceOff(c, 1, 0, 0, 0); }
      if (c.x > RM.maxX - r) { c.x = RM.maxX - r; if (c.vx > 0) bounceOff(c, -1, 0, 0, 0); }
      if (c.z < C.barFrontZ + r) { c.z = C.barFrontZ + r; slideAlong(c, 0, 1); }   // the bar never bounces you
      if (c.z > RM.maxZ - r) { c.z = RM.maxZ - r; if (c.vz > 0) bounceOff(c, 0, -1, 0, 0); }
    }
    // players bounce off each other
    for (let i = 0; i < G.chars.length; i++) {
      for (let j = i + 1; j < G.chars.length; j++) {
        const a = G.chars[i], b = G.chars[j];
        if (a.fallT > 0 || b.fallT > 0) continue;
        const dx = a.x - b.x, dz = a.z - b.z;
        const d = Math.hypot(dx, dz), min = a.radius + b.radius;
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d, push = (min - d) / 2;
          a.x += nx * push; a.z += nz * push;
          b.x -= nx * push; b.z -= nz * push;
          // Remember who touched whom, so a push into a hatch can be credited
          a.pushedBy = b; a.pushedT = G.time;
          b.pushedBy = a; b.pushedT = G.time;
          const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (rv < 0) {
            const j2 = (-(1 + C.bounce) * rv) / 2 + C.bumpImpulse * 0.5;
            a.vx += j2 * nx; a.vz += j2 * nz;
            b.vx -= j2 * nx; b.vz -= j2 * nz;
            bump(a, -rv, nx, nz);
            bump(b, -rv, -nx, -nz);
          }
        }
      }
    }
    // open cellar hatches
    for (const c of G.chars) {
      if (c.fallT > 0) continue;
      const hole = HMB.holeAt(c.x, c.z, 0.12);
      if (hole) fallIn(c, hole);
    }
  }

  function fallIn(c, hole) {
    const lost = c.beers;
    if (lost > 0) shatterFx(hole.x, 0.06, hole.z, false);
    c.beers = 0;
    c.fall(hole);
    sfx(c, 'fall');
    if (lost > 0) sfx(c, 'loseBeers');

    // Bumped in by another player shortly before? They score for every beer that went down.
    const pusher = c.pushedBy && c.pushedBy !== c && G.time - c.pushedT <= C.pushCreditSeconds ? c.pushedBy : null;
    const pts = pusher ? Math.round(lost * C.pushPointsPerBeer) : 0;
    if (pusher && pts > 0) pusher.score += pts;
    c.stats.falls++;
    c.stats.lost += lost;
    if (pusher) pusher.stats.pushes++;
    c.pushedBy = null;
    const live = G.state === 'playing';
    const s = lost === 1 ? '' : 's';

    if (c.isHuman) {
      G.clearTarget();
      if (live) {
        if (pusher) {
          UI.toast(`${pusher.name} pushed you into the cellar! −${lost} beer${s}` + (pts ? `, +${pts} for them` : ''), 'bad');
        } else {
          UI.toast(lost ? `You fell into the cellar! −${lost} beer${s}` : 'You fell into the cellar!', 'bad');
        }
        G.shake = 0.35;
        vibrate(200);
      }
    } else if (live) {
      if (pusher && pusher.isHuman) {
        UI.toast(pts ? `You pushed ${c.name} into the cellar! +${pts} points` : `You pushed ${c.name} into the cellar!`, 'good');
      }
      if (pts > 0) floatText(`+${pts}`, hole.x, hole.z, pusher.isHuman ? '#6fcf7b' : '#f4a72c');
      else if (lost > 0) floatText(`−${lost}`, hole.x, hole.z, '#e5533d');
    }
  }

  // ------------------------------------------------------------ camera: top-down, bar at the top of the screen
  function cameraTarget() {
    const h = G.human;
    // Stop at the edges of the map so the screen stays filled with the room
    const cx = clamp(h.x, C.room.minX + 5, C.room.maxX - 5);
    const lz = clamp(h.z - 0.5, 7, C.room.maxZ - 6);
    return {
      pos: new THREE.Vector3(cx, C.cameraHeight, lz + C.cameraBack),
      look: new THREE.Vector3(cx, 0, lz),
    };
  }

  function snapCamera() {
    const t = cameraTarget();
    G.camPos.copy(t.pos);
    G.camLook.copy(t.look);
  }

  function updateCamera(dt) {
    let pos, look;
    if (G.state === 'intro' || G.state === 'results') {
      // Slow drift over the whole bar behind the menus
      const a = G.time * 0.12;
      pos = new THREE.Vector3(Math.sin(a) * 5, 24, 34);
      look = new THREE.Vector3(Math.sin(a) * 2, 0, 17);
    } else {
      const t = cameraTarget();
      pos = t.pos; look = t.look;
    }
    const k = 1 - Math.exp(-(G.state === 'playing' || G.state === 'countdown' ? 6 : 2) * dt);
    G.camPos.lerp(pos, k);
    G.camLook.lerp(look, k);
    const cam = G.camera;
    cam.position.copy(G.camPos);
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt);
      const s = G.shake * 0.5;
      cam.position.x += rand(-s, s);
      cam.position.z += rand(-s, s);
    }
    cam.lookAt(G.camLook);
    if (G.drunkAmt > 0) cam.rotateZ(Math.sin(G.time * 1.4) * 0.06 * G.drunkAmt);
  }

  // ------------------------------------------------------------ main loop
  // Up on the screen is towards the bar (-z), right is +x.
  function humanLean() {
    const l = I.getLean();
    return { x: l.right, z: -l.forward };
  }

  const STILL = { x: 0, z: 0 };

  function step(dt) {
    const h = G.human;
    const t = G.time;

    if (G.state !== 'results') G.world.updateWalkers(dt, G.chars);

    if (G.state === 'countdown') {
      G.countdownT -= dt;
      const n = Math.ceil(G.countdownT - 0.6);
      if (n !== G.lastCount) {
        G.lastCount = n;
        if (n > 0) { UI.countdown(String(n)); A.play('beep'); }
        else {
          UI.countdown('GO!', true);
          A.play('go');
        }
      }
      if (G.countdownT <= 0) {
        UI.countdown(null);
        G.state = 'playing';
        G.playStart = G.time;
      }
      G.chars.forEach((c) => c.update(dt, STILL, t));
      collide();
      return;
    }

    if (G.state === 'intro') {
      // Rivals play an attract-mode round behind the tutorial
      h.update(dt, STILL, t);
      G.bots.forEach((b) => b.c.update(dt, b.update(dt), t));
      collide();
      return;
    }

    if (G.state !== 'playing') return;

    // Tilt chosen but the phone never reported any: fall back to the joystick
    if (I.mode === 'tilt' && !I.gyro.seen && G.time - G.playStart > 1.2 && !G.tiltWarned) {
      G.tiltWarned = true;
      I.mode = 'stick';
      UI.setMode('stick');
      UI.toast('No tilt sensor found, switched to the joystick', 'warn');
    }

    G.remaining -= dt;

    // Standing at the bar refills everyone's tray: one beer each time the cooldown runs out
    G.chars.forEach((c) => { if (c.beers < C.maxBeers && c.getCd <= 0) G.tryGetBeer(c); });
    h.update(dt, h.stunT > 0 ? STILL : humanLean(), t);
    G.bots.forEach((b) => b.c.update(dt, b.update(dt), t));
    collide();

    if (G.remaining <= 0) { G.remaining = 0; endMatch(); }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - G.last) / 1000);
    G.last = now;
    G.time += dt;

    step(dt);
    if (G.state !== 'results') HMB.MAP.tables.forEach((t) => { if (t.cooldownT > 0) t.cooldownT = Math.max(0, t.cooldownT - dt); });
    updateFx(dt);
    G.chars.forEach((c) => c.animate(dt, G.time));
    updateTargeting();
    G.world.update(dt, G.time, G.chars, G.state === 'playing' ? G.human : null);

    // Double-vision strength eases in and out
    const target = G.state === 'playing' && G.human.drunkT > 0 ? Math.min(1, G.human.drunkT / 0.8) : 0;
    G.drunkAmt += (target - G.drunkAmt) * Math.min(1, dt * 4);
    if (G.drunkAmt < 0.005) G.drunkAmt = 0;

    updateCamera(dt);
    if (G.state === 'playing' || G.state === 'countdown') UI.update(G);

    const r = G.renderer;
    if (G.drunkAmt > 0) {
      r.setRenderTarget(G.rt);
      r.render(G.scene, G.camera);
      r.setRenderTarget(null);
      G.postMat.uniforms.amount.value = G.drunkAmt;
      G.postMat.uniforms.time.value = G.time;
      r.render(G.postScene, G.postCam);
    } else {
      r.render(G.scene, G.camera);
    }
    requestAnimationFrame(loop);
  }

  // Wait briefly for the display font so canvas labels use it
  function boot() {
    if (typeof THREE === 'undefined') {
      document.body.insertAdjacentHTML('beforeend',
        '<p style="position:fixed;inset:auto 16px 40% 16px;text-align:center;color:#fff3d6;font:700 16px system-ui">Could not load the 3D engine. Check your internet connection and reload.</p>');
      return;
    }
    const fontReady = document.fonts && document.fonts.load
      ? Promise.race([
        Promise.all([document.fonts.load('64px "Lilita One"'), document.fonts.load('800 26px "Nunito"')]),
        new Promise((res) => setTimeout(res, 1500)),
      ]).catch(() => {})
      : Promise.resolve();
    fontReady.then(init);
  }
  boot();
})();
