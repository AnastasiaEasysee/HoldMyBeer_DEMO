// Characters: the low-poly figure and the shared player logic (you and the AI rivals use the same rules).
(function () {
  const C = HMB.CONFIG;
  const GEO = {}, MAT = {};

  function shared() {
    if (GEO.glass) return;
    GEO.glass = new THREE.CylinderGeometry(0.05, 0.042, 0.15, 10);
    GEO.glass.translate(0, 0.075, 0);
    GEO.foam = new THREE.CylinderGeometry(0.054, 0.052, 0.04, 10);
    GEO.foam.translate(0, 0.165, 0);
    GEO.shard = new THREE.TetrahedronGeometry(0.04);
    GEO.puddle = new THREE.CircleGeometry(0.42, 20);
    GEO.puddle.rotateX(-Math.PI / 2);
    MAT.beer = new THREE.MeshLambertMaterial({ color: 0xf2a51e, emissive: 0x3a1d00 });
    MAT.foam = new THREE.MeshLambertMaterial({ color: 0xfff4dc });
    MAT.empty = new THREE.MeshLambertMaterial({ color: 0xcfe8ef, emissive: 0x223338, transparent: true, opacity: 0.7 });
    MAT.shard = new THREE.MeshBasicMaterial({ color: 0xe8f6fa });
  }
  HMB.GEO = GEO;
  HMB.MAT = MAT;

  HMB.makePint = function (empty) {
    shared();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(GEO.glass, empty ? MAT.empty : MAT.beer));
    if (!empty) g.add(new THREE.Mesh(GEO.foam, MAT.foam));
    return g;
  };

  const UP = new THREE.Vector3(0, 1, 0);
  function limb(a, b, r, mat) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 8), mat);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
    return m;
  }

  // Ten spots on the tray, filled from the middle out
  const SLOTS = [
    [0, 0], [0.13, 0], [-0.13, 0], [0.065, 0.115], [-0.065, 0.115],
    [0.065, -0.115], [-0.065, -0.115], [0.24, 0.08], [-0.24, 0.08], [0, 0.24],
  ];

  const TRAY_LAYERS = 3;   // so the tray can show up to 30 beers
  HMB.TRAY_CAPACITY = SLOTS.length * TRAY_LAYERS;

  // Local +z is "forward" for every figure.
  HMB.buildFigure = function (o) {
    shared();
    const L = (c) => new THREE.MeshLambertMaterial({ color: c });
    const root = new THREE.Group(), body = new THREE.Group(), lean = new THREE.Group();
    root.add(body);
    body.add(lean);
    const shirt = L(o.shirt), pants = L(o.pants || 0x2b2633), skin = L(o.skin || 0xf1c7a0), hair = L(o.hair || 0x3a2414);
    const dark = L(0x15100c);

    const legGeo = new THREE.CylinderGeometry(0.09, 0.075, 0.8, 8);
    legGeo.translate(0, -0.4, 0);
    const shoeGeo = new THREE.BoxGeometry(0.13, 0.07, 0.24);
    shoeGeo.translate(0, -0.79, 0.04);
    const legL = new THREE.Mesh(legGeo, pants);
    const legR = new THREE.Mesh(legGeo, pants);
    legL.position.set(-0.12, 0.82, 0);
    legR.position.set(0.12, 0.82, 0);
    legL.add(new THREE.Mesh(shoeGeo, dark));
    legR.add(new THREE.Mesh(shoeGeo, dark));
    lean.add(legL, legR);

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.4, 4, 12), shirt);
    torso.position.y = 1.2;
    torso.scale.set(1, 1, 0.78);
    lean.add(torso);
    if (o.apron) {
      const apron = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.02), L(0xf3ead6));
      apron.position.set(0, 1.08, 0.2);
      lean.add(apron);
    }

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 16, 12), skin);
    head.position.y = 1.83;
    const hairM = new THREE.Mesh(new THREE.SphereGeometry(0.205, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
    hairM.position.y = 1.85;
    hairM.rotation.x = -0.3;
    const eyeGeo = new THREE.SphereGeometry(0.026, 6, 6);
    const e1 = new THREE.Mesh(eyeGeo, dark), e2 = new THREE.Mesh(eyeGeo, dark);
    e1.position.set(-0.07, 1.86, 0.172);
    e2.position.set(0.07, 1.86, 0.172);
    lean.add(head, hairM, e1, e2);

    let tray = null;
    const glasses = [];
    const shL = new THREE.Vector3(-0.27, 1.52, 0.02), shR = new THREE.Vector3(0.27, 1.52, 0.02);
    if (o.tray) {
      const hL = new THREE.Vector3(-0.22, 1.18, 0.42), hR = new THREE.Vector3(0.22, 1.18, 0.42);
      lean.add(limb(shL, hL, 0.065, shirt), limb(shR, hR, 0.065, shirt));
      const handGeo = new THREE.SphereGeometry(0.06, 8, 6);
      const h1 = new THREE.Mesh(handGeo, skin), h2 = new THREE.Mesh(handGeo, skin);
      h1.position.copy(hL); h2.position.copy(hR);
      lean.add(h1, h2);
      tray = new THREE.Group();
      tray.position.set(0, 1.22, 0.5);
      lean.add(tray);
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.34, 0.025, 24), L(0xb9b4a8));
      tray.add(plate);
      // Ten glasses per layer; beers 11–20 and 21–30 are stacked on top of the layer below
      for (let layer = 0; layer < TRAY_LAYERS; layer++) {
        const shrink = 1 - layer * 0.1, turn = layer * 0.5;
        const ct = Math.cos(turn), st = Math.sin(turn);
        SLOTS.forEach(([sx, sz]) => {
          const p = HMB.makePint(false);
          p.position.set((sx * ct - sz * st) * shrink, 0.012 + layer * 0.2, (sx * st + sz * ct) * shrink);
          p.visible = false;
          tray.add(p);
          glasses.push(p);
        });
      }
    } else {
      const hL = new THREE.Vector3(-0.33, 0.9, 0.06), hR = new THREE.Vector3(0.3, 1.12, 0.26);
      lean.add(limb(shL, hL, 0.065, shirt), limb(shR, hR, 0.065, shirt));
      if (o.pint) {
        const p = HMB.makePint(false);
        p.position.set(0.3, 1.08, 0.3);
        lean.add(p);
      }
    }

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.014;
    root.add(shadow);

    return { root, body, lean, legL, legR, tray, glasses, shirtMat: shirt };
  };

  function lerpAngle(a, b, t) {
    let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (d < -Math.PI) d += Math.PI * 2;
    return a + d * t;
  }
  HMB.lerpAngle = lerpAngle;

  class Character {
    constructor(game, o) {
      this.g = game;
      this.name = o.name;
      this.isHuman = !!o.isHuman;
      this.color = o.shirt;
      this.radius = C.playerRadius;
      this.skill = o.skill || 1;
      this.fig = HMB.buildFigure({ shirt: o.shirt, pants: o.pants, hair: o.hair, tray: true });
      const root = this.fig.root;

      // Invulnerability bubble
      this.shieldMat = new THREE.MeshBasicMaterial({ color: 0x7fd8e8, transparent: true, opacity: 0.22, depthWrite: false });
      this.shield = new THREE.Mesh(new THREE.SphereGeometry(0.98, 24, 16), this.shieldMat);
      this.shield.position.y = 1.0;
      this.shield.visible = false;
      root.add(this.shield);

      // Stun stars
      this.stars = new THREE.Group();
      const starMat = new THREE.MeshBasicMaterial({ color: 0xffd84a });
      for (let i = 0; i < 3; i++) {
        const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), starMat);
        const a = (i / 3) * Math.PI * 2;
        s.position.set(Math.cos(a) * 0.3, 0, Math.sin(a) * 0.3);
        this.stars.add(s);
      }
      this.stars.position.y = 2.15;
      this.stars.visible = false;
      root.add(this.stars);

      // Target highlight ring (shown while you aim at this player)
      this.ringMat = new THREE.MeshBasicMaterial({ color: 0xe5533d, transparent: true, opacity: 0.9, depthWrite: false, depthTest: false });
      this.ring = new THREE.Mesh(new THREE.RingGeometry(0.52, 0.7, 32), this.ringMat);
      this.ring.rotation.x = -Math.PI / 2;
      this.ring.position.y = 0.03;
      this.ring.renderOrder = 20;
      this.ring.visible = false;
      root.add(this.ring);

      // Name tag + "about to throw" alert
      this.tag = HMB.textSprite(o.name, { height: 0.5, size: 54, bg: 'rgba(20,13,9,0.72)', color: '#fff3d6', depthTest: false, renderOrder: 30 });
      this.tag.position.y = 2.45;
      this.tag.visible = !this.isHuman;
      root.add(this.tag);
      this.alert = HMB.textSprite('!', { height: 0.7, size: 80, pad: 26, bg: '#e5533d', color: '#fff3d6', depthTest: false, renderOrder: 31 });
      this.alert.position.y = 3.15;
      this.alert.visible = false;
      root.add(this.alert);

      game.scene.add(root);
      this.ph = Array.from({ length: 6 }, () => Math.random() * Math.PI * 2);
      this.reset(o.x || 0, o.z || 3);
    }

    reset(x, z) {
      this.x = x; this.z = z;
      this.vx = 0; this.vz = 0;
      this.facing = 0;
      this.beers = 0;
      this.glasses = 0;
      this.score = 0;
      this.getCd = 0;
      this.drinkCd = 0;
      this.drunkT = 0;
      this.boostT = 0;
      this.shieldT = 0;
      this.shieldKind = 'drink';
      this.stunT = 0;
      this.knockT = 0;
      this.bumpCd = 0;
      this.fallT = 0;
      this.hole = null;
      this.pushedBy = null;            // last player who bumped into you (for push-into-hole points)
      this.pushedT = -99;
      // End-of-round statistics
      this.stats = { biggest: 0, served: 0, hitsLanded: 0, hitsTaken: 0, blocks: 0, pushes: 0, falls: 0, lost: 0, drinks: 0 };
      this.onSticky = false;
      this.sway = { x: 0, z: 0 };      // total pull of the tray, roughly -1..1 per axis
      this.slosh = { x: 0, z: 0 };     // part of the sway caused by stopping, turning and bumps
      this.walkPhase = 0;
      this.ring.visible = false;
      this.alert.visible = false;
      this.animate(0, 0);
    }

    inBarZone() { return this.z - this.radius <= C.barFrontZ + C.barReach; }
    barDistance() { return this.z - this.radius - C.barFrontZ; }
    // Near the bar nobody can hit you with a glass
    isSafe() { return this.barDistance() < C.barSafeDistance; }
    canDrink() {
      return this.beers > 0 && this.drinkCd <= 0 && this.stunT <= 0 && this.barDistance() >= C.drinkMinBarDistance;
    }
    setShield(sec, kind) {
      if (sec > this.shieldT) { this.shieldT = sec; this.shieldKind = kind; }
    }
    maxSpeed() {
      const load = Math.max(0.6, 1 - this.beers * C.speedLossPerBeer);
      return C.walkSpeed * this.skill * load *
        (this.boostT > 0 ? C.boostSpeedMultiplier : 1) *
        (this.onSticky ? C.stickySpeed : 1);
    }
    loadFrac() { return this.beers / 10; }   // 1 = a classic full tray of 10; bigger stacks slosh even more

    // A bump sets the beers sloshing in a random-ish direction
    stagger(impact, nx, nz) {
      const k = C.bumpStagger * Math.min(2, impact / 3) * (0.3 + this.loadFrac());
      const a = Math.atan2(nz, nx) + (Math.random() - 0.5) * 2.2;
      this.slosh.x += Math.cos(a) * k;
      this.slosh.z += Math.sin(a) * k;
    }

    // Drop into a cellar hatch: the whole tray goes, then you climb out
    fall(hole) {
      this.fallT = C.holeFallSeconds;
      this.hole = hole;
      this.vx = this.vz = 0;
    }

    // lean: desired lean in world space ({x, z}, length <= 1)
    update(dt, lean, t) {
      this.getCd = Math.max(0, this.getCd - dt);
      this.drinkCd = Math.max(0, this.drinkCd - dt);
      this.drunkT = Math.max(0, this.drunkT - dt);
      this.boostT = Math.max(0, this.boostT - dt);
      this.shieldT = Math.max(0, this.shieldT - dt);
      this.stunT = Math.max(0, this.stunT - dt);
      this.knockT = Math.max(0, this.knockT - dt);
      this.bumpCd = Math.max(0, this.bumpCd - dt);

      if (this.fallT > 0) {
        this.fallT -= dt;
        this.x = this.hole.x; this.z = this.hole.z;
        if (this.fallT <= 0) this.climbOut();
        return;
      }
      this.onSticky = HMB.onSticky(this.x, this.z);

      // Tray sway. It is weak while standing and strong while walking, and it adds its own
      // drift on top of your steering, so leaning harder does not drown it out.
      const drunk = this.drunkT > 0;
      const speedFrac = Math.min(1, Math.hypot(this.vx, this.vz) / C.walkSpeed);
      const amp = (C.wobbleBase + this.beers * C.wobblePerBeer) *
        (C.wobbleStanding + C.wobbleMoving * speedFrac) *
        (drunk ? C.drunkWobbleMultiplier : 1);
      const p = this.ph;
      const nx = (Math.sin(t * 1.9 + p[0]) + 0.6 * Math.sin(t * 3.3 + p[1]) + 0.4 * Math.sin(t * 0.7 + p[2])) / 2;
      const nz = (Math.sin(t * 1.6 + p[3]) + 0.6 * Math.sin(t * 2.9 + p[4]) + 0.4 * Math.sin(t * 0.8 + p[5])) / 2;
      const decay = Math.exp(-C.sloshDecay * dt);
      this.slosh.x *= decay;
      this.slosh.z *= decay;
      let sx = amp * nx + this.slosh.x, sz = amp * nz + this.slosh.z;
      const sm = Math.hypot(sx, sz);
      if (sm > 1.2) { sx *= 1.2 / sm; sz *= 1.2 / sm; }
      this.sway.x = sx; this.sway.z = sz;

      // Your steering (amplified by the load and by drinking)
      let sens = 1 + this.beers * C.sensitivityPerBeer;
      if (drunk) sens *= C.drunkSensitivityMultiplier;
      let ex = lean.x * sens, ez = lean.z * sens;
      const m = Math.hypot(ex, ez);
      if (m > 1) { ex /= m; ez /= m; }
      if (this.stunT > 0) { ex = 0; ez = 0; }

      const max = this.maxSpeed();
      const drift = C.swayDrift * (this.onSticky ? C.stickySpeed : 1);
      const tx = ex * max + sx * drift;
      const tz = ez * max + sz * drift;
      const acc = C.acceleration * (this.knockT > 0 ? 0.15 : 1) * (this.stunT > 0 ? 0.6 : 1) * (this.onSticky ? 0.6 : 1);
      const k = 1 - Math.exp(-acc * dt);
      const dvx = (tx - this.vx) * k, dvz = (tz - this.vz) * k;
      this.vx += dvx;
      this.vz += dvz;
      // Stopping or turning sharply makes the beers carry on without you
      const sk = C.sloshCoupling * this.loadFrac();
      this.slosh.x -= dvx * sk;
      this.slosh.z -= dvz * sk;

      this.x += this.vx * dt;
      this.z += this.vz * dt;
    }

    climbOut() {
      // Pop out on the side of the hatch facing the middle of the room
      const h = this.hole;
      const side = h.z > 18 ? -1 : 1;
      this.x = h.x;
      this.z = h.z + side * (h.half + this.radius + 0.25);
      this.hole = null;
      this.stunT = 0.4;
    }

    animate(dt, t) {
      const f = this.fig;
      if (this.fallT > 0) {
        // Sink out of sight, then rise back up the ladder
        const k = 1 - this.fallT / C.holeFallSeconds;
        f.root.position.set(this.x, k < 0.25 ? -k * 8 : -2, this.z);
        f.root.visible = k < 0.25 || k > 0.97;
        return;
      }
      f.root.visible = true;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0.25 && this.stunT <= 0) {
        this.facing = lerpAngle(this.facing, Math.atan2(this.vx, this.vz), 1 - Math.exp(-10 * dt));
      }
      this.walkPhase += sp * dt * 3.2;
      const amt = Math.min(1, sp / 2.5);
      const swing = Math.sin(this.walkPhase) * amt * 0.65;
      f.legL.rotation.x = swing;
      f.legR.rotation.x = -swing;
      f.body.rotation.y = this.facing;
      f.lean.rotation.x = Math.min(0.22, sp * 0.04);
      f.lean.rotation.z = this.stunT > 0 ? Math.sin(t * 22) * 0.1 : 0;
      f.lean.position.y = Math.abs(Math.sin(this.walkPhase)) * 0.04 * amt;

      // Tray tilts with the sway (in the figure's local frame)
      const cf = Math.cos(this.facing), sf = Math.sin(this.facing);
      const sx = this.sway.x, sz = this.sway.z;
      const lx = sx * cf - sz * sf;
      const lz = sx * sf + sz * cf;
      f.tray.rotation.z = Math.max(-0.6, Math.min(0.6, -lx * 0.7));
      f.tray.rotation.x = Math.max(-0.6, Math.min(0.6, lz * 0.7));
      // The whole body leans with the tray too, so you can see the pull from above
      f.lean.rotation.z += Math.max(-0.25, Math.min(0.25, -lx * 0.25));
      for (let i = 0; i < f.glasses.length; i++) f.glasses[i].visible = i < this.beers;

      // Shield bubble (flickers in its last second)
      const sh = this.shieldT > 0 && (this.shieldT > 1 || Math.floor(t * 12) % 2 === 0);
      this.shield.visible = sh;
      if (sh) {
        this.shieldMat.color.setHex(this.shieldKind === 'drink' ? 0x7fd8e8 : 0xfff3d6);
        this.shieldMat.opacity = 0.17 + Math.sin(t * 6) * 0.05;
      }
      this.stars.visible = this.stunT > 0;
      if (this.stars.visible) this.stars.rotation.y = t * 7;

      f.root.position.set(this.x, 0, this.z);
    }
  }

  HMB.Character = Character;
})();
