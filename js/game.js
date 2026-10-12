// Main loop: rules, collisions, effects, camera and rendering for the phone view.
(function () {
  const C = HMB.CONFIG;
  const A = HMB.Audio;
  const I = HMB.Input;
  const UI = HMB.UI;
  const rand = (a, b) => a + Math.random() * (b - a);

  const G = {
    state: 'boot',        // intro -> countdown -> playing -> results
    time: 0,
    remaining: C.matchSeconds,
    chars: [],
    bots: [],
    human: null,
    yaw: 0,
    fx: [],
    aim: null,
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
    G.scene.fog = new THREE.Fog(0x140d09, 20, 42);
    G.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 80);
    G.camPos = new THREE.Vector3(0, 9, 26);
    G.camLook = new THREE.Vector3(0, 0, 13);

    G.world = HMB.buildWorld(G.scene);
    G.nav = new HMB.NavGrid();

    const sp = HMB.MAP.spawns;
    G.human = new HMB.Character(G, { name: 'You', isHuman: true, shirt: C.humanColor, pants: 0x2a3550, hair: 0x4a2a14, x: sp[0].x, z: sp[0].z });
    G.chars = [G.human];
    C.bots.forEach((b, i) => {
      const c = new HMB.Character(G, Object.assign({}, b, { x: sp[i + 1].x, z: sp[i + 1].z }));
      G.chars.push(c);
      G.bots.push(new HMB.BotBrain(G, c, b));
    });

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
    const hfov = 62 * Math.PI / 180;
    const vfov = 2 * Math.atan(Math.tan(hfov / 2) / aspect) * 180 / Math.PI;
    G.camera.fov = Math.max(58, Math.min(84, vfov));
    G.camera.updateProjectionMatrix();
    const v = G.renderer.getDrawingBufferSize(new THREE.Vector2());
    G.rt.setSize(v.x, v.y);
  }

  // ------------------------------------------------------------ flow
  G.start = function (name) {
    G.human.name = name;
    UI.showIntro(false);
    G.restart();
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
    const sp = HMB.MAP.spawns;
    G.chars.forEach((c, i) => c.reset(sp[i].x, sp[i].z));
    G.bots.forEach((b) => b.reset());
    G.fx.forEach((f) => f.dispose && f.dispose());
    G.fx = [];
    G.aim = null;
    G.yaw = 0;
    G.remaining = C.matchSeconds;
    G.drunkAmt = 0;
    G.shake = 0;
    G.tiltWarned = false;
    I.releaseAll();
    snapCamera();
  }

  function endMatch() {
    G.state = 'results';
    G.cancelAim();
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
    const v = Math.max(0, 0.7 - d / 18);
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
    if (c.stunT > 0 || !c.inBarZone() || c.getCd > 0 || c.beers >= C.maxBeers) return false;
    c.beers++;
    c.getCd = C.getBeerCooldown;
    sfx(c, 'getBeer');
    if (c.isHuman) UI.bumpBeers();
    return true;
  };

  G.tryServe = function (c, table) {
    const t = table || G.servableTable(c);
    if (!t || c.beers <= 0 || c.stunT > 0) return false;
    const pts = c.beers * t.points;
    c.score += pts;
    serveFx(c, t, c.beers, pts);
    c.beers = 0;
    sfx(c, 'serve');
    if (c.isHuman) UI.toast(`+${pts}`, 'big');
    return true;
  };

  G.tryDrink = function (c) {
    if (!c.canDrink()) return false;
    c.beers--;
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
    if (c.glasses <= 0 || c.stunT > 0 || !target) return false;
    if (Math.hypot(target.x - c.x, target.z - c.z) > C.throwRange) return false;
    c.glasses--;
    projectileFx(c, target);
    sfx(c, 'throw');
    return true;
  };

  function onGlassHit(from, target, mesh) {
    const live = G.state === 'playing';
    if (target.shieldT > 0) {
      sfx(target, 'blocked');
      if (live && target.isHuman) UI.toast(`Your shield blocked ${from.name}'s glass`, 'good');
      else if (live && from.isHuman) UI.toast(`${target.name}'s shield blocked it`, 'warn');
      shatterFx(mesh.position.x, mesh.position.y, mesh.position.z, false);
      return;
    }
    target.stunT = C.stunSeconds;
    target.vx *= 0.2;
    target.vz *= 0.2;
    const lost = Math.min(C.beersLostOnHit, target.beers);
    if (lost > 0) dropBeersFx(target, lost);
    target.beers -= lost;
    target.setShield(C.hitShieldSeconds, 'hit');
    shatterFx(mesh.position.x, mesh.position.y, mesh.position.z, false);
    sfx(target, 'loseBeers');
    const s = lost === 1 ? '' : 's';
    if (!live) return;
    if (target.isHuman) {
      UI.hitFlash();
      G.shake = 0.45;
      UI.toast(`${from.name} hit you! −${lost} beer${s}`, 'bad');
      if (navigator.vibrate) { try { navigator.vibrate(120); } catch (_) { /* ignore */ } }
    } else if (from.isHuman) {
      UI.toast(`Hit ${target.name}! They dropped ${lost} beer${s}`, 'good');
    }
  }

  // What the big button does right now
  G.currentAction = function () {
    const h = G.human;
    if (h.stunT > 0) return { kind: 'none', label: 'Dazed', sub: '', enabled: false };
    if (h.inBarZone()) {
      if (h.beers >= C.maxBeers) return { kind: 'none', label: 'Tray full', sub: `${h.beers}/${C.maxBeers}`, enabled: false };
      return { kind: 'get', label: 'Get Beer', sub: `${h.beers}/${C.maxBeers}`, enabled: h.getCd <= 0, cd: h.getCd / C.getBeerCooldown };
    }
    const t = G.servableTable(h);
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
    if (a.kind === 'get') ok = G.tryGetBeer(G.human);
    else if (a.kind === 'serve') ok = G.tryServe(G.human);
    else if (a.kind === 'drink') ok = G.tryDrink(G.human);
    if (!ok) A.play('deny');
  };

  // ------------------------------------------------------------ throwing (you)
  G.startAim = function () {
    if (G.state !== 'playing' || G.human.glasses <= 0 || G.human.stunT > 0) return;
    G.aim = { target: null };
  };

  G.cancelAim = function () {
    G.aim = null;
    G.chars.forEach((c) => { c.ring.visible = false; });
  };

  G.releaseThrow = function () {
    if (!G.aim) return;
    const t = G.aim.target;
    if (t) G.throwGlass(G.human, t);
    else { UI.toast(`No rival in sight within ${C.throwRange} m`, 'warn'); A.play('deny'); }
    G.cancelAim();
  };

  function updateAim() {
    const h = G.human;
    if (!G.aim) return;
    if (h.glasses <= 0 || h.stunT > 0) { G.cancelAim(); return; }
    const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
    const cone = Math.cos(C.throwAimConeDeg * Math.PI / 180);
    let best = null, bd = -1;
    for (const c of G.chars) {
      if (c === h) continue;
      const dx = c.x - h.x, dz = c.z - h.z, d = Math.hypot(dx, dz);
      if (d > C.throwRange || d < 0.01) continue;
      const dot = (dx * fx + dz * fz) / d;
      if (dot > cone && dot > bd) { bd = dot; best = c; }
    }
    G.aim.target = best;
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
    const shown = Math.min(n, 10);
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
    // Floating points
    const label = HMB.textSprite(`+${pts}`, { height: 0.55, size: 72, color: '#f4a72c', stroke: '#241409', strokeWidth: 12, pad: 20, depthTest: false, renderOrder: 40 });
    label.position.set(t.x, 2.0, t.z);
    G.scene.add(label);
    let lt = 0;
    addFx({
      update(dt) {
        lt += dt;
        label.position.y = 2.0 + lt * 1.1;
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
          start.y + (1.35 - start.y) * k + Math.sin(k * Math.PI) * 0.7,
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

  // ------------------------------------------------------------ physics
  function bump(c, impact) {
    if (impact < 0.9) return;
    c.knockT = C.knockSeconds;
    if (c.bumpCd <= 0) {
      c.bumpCd = 0.3;
      sfx(c, 'bounce');
      if (c.isHuman && navigator.vibrate) { try { navigator.vibrate(30); } catch (_) { /* ignore */ } }
    }
  }

  function collide() {
    const R = C.room;
    for (const c of G.chars) {
      const r = c.radius;
      for (const o of HMB.obstacles) {
        const dx = c.x - o.x, dz = c.z - o.z;
        const d = Math.hypot(dx, dz), min = r + o.r;
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d;
          c.x = o.x + nx * min;
          c.z = o.z + nz * min;
          const vn = c.vx * nx + c.vz * nz;
          if (vn < 0) {
            c.vx -= (1 + C.bounce) * vn * nx;
            c.vz -= (1 + C.bounce) * vn * nz;
            c.vx += nx * C.bumpImpulse * Math.min(1, -vn / 3);
            c.vz += nz * C.bumpImpulse * Math.min(1, -vn / 3);
            bump(c, -vn);
          }
        }
      }
      // Walls and the bar counter
      if (c.x < R.minX + r) { c.x = R.minX + r; if (c.vx < 0) { bump(c, -c.vx); c.vx = -c.vx * C.bounce; } }
      if (c.x > R.maxX - r) { c.x = R.maxX - r; if (c.vx > 0) { bump(c, c.vx); c.vx = -c.vx * C.bounce; } }
      if (c.z < C.barFrontZ + r) { c.z = C.barFrontZ + r; if (c.vz < 0) { bump(c, -c.vz); c.vz = -c.vz * C.bounce; } }
      if (c.z > R.maxZ - r) { c.z = R.maxZ - r; if (c.vz > 0) { bump(c, c.vz); c.vz = -c.vz * C.bounce; } }
    }
    // Players bounce off each other
    for (let i = 0; i < G.chars.length; i++) {
      for (let j = i + 1; j < G.chars.length; j++) {
        const a = G.chars[i], b = G.chars[j];
        const dx = a.x - b.x, dz = a.z - b.z;
        const d = Math.hypot(dx, dz), min = a.radius + b.radius;
        if (d < min && d > 1e-4) {
          const nx = dx / d, nz = dz / d, push = (min - d) / 2;
          a.x += nx * push; a.z += nz * push;
          b.x -= nx * push; b.z -= nz * push;
          const rv = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (rv < 0) {
            const j2 = (-(1 + C.bounce) * rv) / 2 + C.bumpImpulse * 0.3;
            a.vx += j2 * nx; a.vz += j2 * nz;
            b.vx -= j2 * nx; b.vz -= j2 * nz;
            bump(a, -rv);
            bump(b, -rv);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ camera
  function cameraTarget() {
    const h = G.human;
    const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
    const R = C.room, m = 0.35;
    const pos = new THREE.Vector3(
      Math.max(R.minX + m, Math.min(R.maxX - m, h.x - fx * C.cameraDistance)),
      C.cameraHeight,
      Math.max(R.minZ + m, Math.min(R.maxZ - m, h.z - fz * C.cameraDistance)));
    const look = new THREE.Vector3(h.x + fx * 2.4, 0.8, h.z + fz * 2.4);
    return { pos, look };
  }

  function snapCamera() {
    const t = cameraTarget();
    G.camPos.copy(t.pos);
    G.camLook.copy(t.look);
  }

  function updateCamera(dt) {
    let pos, look;
    if (G.state === 'intro' || G.state === 'results') {
      // Slow fly-around of the bar behind the menus
      const a = G.time * 0.12;
      pos = new THREE.Vector3(Math.sin(a) * 6, 8.5, 13 + Math.cos(a) * 9.5);
      look = new THREE.Vector3(0, 0.5, 12);
    } else {
      const t = cameraTarget();
      pos = t.pos; look = t.look;
    }
    const k = 1 - Math.exp(-(G.state === 'playing' || G.state === 'countdown' ? 9 : 2) * dt);
    G.camPos.lerp(pos, k);
    G.camLook.lerp(look, k);
    const cam = G.camera;
    cam.position.copy(G.camPos);
    if (G.shake > 0) {
      G.shake = Math.max(0, G.shake - dt);
      const s = G.shake * 0.25;
      cam.position.x += rand(-s, s);
      cam.position.y += rand(-s, s);
    }
    cam.lookAt(G.camLook);
    if (G.drunkAmt > 0) cam.rotateZ(Math.sin(G.time * 1.4) * 0.06 * G.drunkAmt);
  }

  // ------------------------------------------------------------ main loop
  function humanLean() {
    const l = I.getLean();
    const fx = Math.sin(G.yaw), fz = Math.cos(G.yaw);
    const rx = -Math.cos(G.yaw), rz = Math.sin(G.yaw);
    return { x: fx * l.forward + rx * l.right, z: fz * l.forward + rz * l.right };
  }

  function step(dt) {
    const h = G.human;
    const t = G.time;

    if (G.state === 'countdown') {
      G.countdownT -= dt;
      const n = Math.ceil(G.countdownT - 0.6);
      if (n !== G.lastCount) {
        G.lastCount = n;
        if (n > 0) { UI.countdown(String(n)); A.play('beep'); }
        else {
          UI.countdown('GO!', true);
          A.play('go');
          if (I.mode === 'tilt') I.calibrate();
        }
      }
      if (G.countdownT <= 0) {
        UI.countdown(null);
        G.state = 'playing';
        G.playStart = G.time;
      }
      G.chars.forEach((c) => c.update(dt, { x: 0, z: 0 }, t));
      collide();
      return;
    }

    if (G.state === 'intro') {
      // Rivals play an attract-mode round behind the tutorial
      h.update(dt, { x: 0, z: 0 }, t);
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
    G.yaw -= I.getLook() * C.lookSpeed * dt;

    h.update(dt, h.stunT > 0 ? { x: 0, z: 0 } : humanLean(), t);
    G.bots.forEach((b) => b.c.update(dt, b.update(dt), t));
    collide();
    updateAim();

    if (G.remaining <= 0) { G.remaining = 0; endMatch(); }
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - G.last) / 1000);
    G.last = now;
    G.time += dt;

    step(dt);
    updateFx(dt);
    G.chars.forEach((c) => c.animate(dt, G.time));
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
