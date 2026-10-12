// The bar: a fixed map (never randomised), its obstacles and hazards, and all the 3D set dressing.
(function () {
  const C = HMB.CONFIG;

  // Seeded RNG so decoration is identical every round.
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  HMB.rng = rng;

  // ---------------------------------------------------------------- map
  // Bar along the back wall (z = 0). Tables further from the bar pay more per beer.
  // Table rows sit at z ≈ 6.5 / 12 / 18 / 24.5 / 32; the gaps between rows (z 9.25, 21.25, 28)
  // and the centre aisle (x = 0) are walking routes for customers.
  const L = 0.35, R = Math.PI - 0.35;   // stool angles: left/right of a table, off the walking lanes
  const tables = [
    { x: -8,   z: 6.5,  r: 0.85, points: 1, stools: [R, -L] },
    { x:  4,   z: 6.5,  r: 0.85, points: 1, stools: [L + Math.PI, -0.3] },
    { x: -3.5, z: 12,   r: 0.9,  points: 2, stools: [R, L] },
    { x:  8.5, z: 12,   r: 0.9,  points: 2, stools: [-R, 0.2] },
    { x: -9.5, z: 18,   r: 0.9,  points: 3, stools: [R, -L] },
    { x:  4.5, z: 18,   r: 0.9,  points: 3, stools: [-R, L] },
    { x: -4,   z: 24.5, r: 0.95, points: 4, stools: [R, -L] },
    { x:  9.5, z: 24.5, r: 0.95, points: 4, stools: [-R, 0.3] },
    { x: -9,   z: 31.5, r: 1.0,  points: 5, stools: [R, L] },
    { x:  4.5, z: 32,   r: 1.0,  points: 5, stools: [-R, L] },
  ];
  const stools = [
    // bar stools (soft: you slide past them instead of bouncing)
    { x: -9, z: 2.05, bar: true }, { x: -4.5, z: 2.05, bar: true }, { x: 0, z: 2.05, bar: true },
    { x: 4.5, z: 2.05, bar: true }, { x: 9, z: 2.05, bar: true },
  ];
  tables.forEach((t) => t.stools.forEach((a) => {
    stools.push({ x: t.x + Math.cos(a) * (t.r + 0.42), z: t.z + Math.sin(a) * (t.r + 0.42) });
  }));
  // Customers standing still
  const people = [
    { x: -12,   z: 12,   face: 1.4, shirt: 0x9a4f4f },
    { x:  7.5,  z: 15,   face: 4.0, shirt: 0x5c7a6a },
    { x: -6.5,  z: 15.2, face: 0.6, shirt: 0xb5835a },
    { x:  12,   z: 18.5, face: 4.6, shirt: 0x4f6f8a },
    { x: -12.2, z: 25,   face: 1.6, shirt: 0x8a8a4b },
    { x:  2,    z: 25,   face: 3.4, shirt: 0x6b5b8a },
    { x: -2,    z: 34.5, face: 3.1, shirt: 0x8a6d4b },
    { x:  10,   z: 34.5, face: 3.6, shirt: 0x7a4f6a },
    { x: -12,   z: 4,    face: 1.2, shirt: 0x4f7a8a },
  ];
  // Customers walking back and forth along the lanes
  const walkerRoutes = [
    { shirt: 0xc0785a, route: [{ x: -11.5, z: 9.25 }, { x: 11.5, z: 9.25 }] },
    { shirt: 0x5a8fc0, route: [{ x: 11.5, z: 21.25 }, { x: -11.5, z: 21.25 }] },
    { shirt: 0x8fc05a, route: [{ x: -11.5, z: 28 }, { x: 11.5, z: 28 }] },
    { shirt: 0xc05a9a, route: [{ x: 0, z: 34 }, { x: 0, z: 4.6 }] },
  ];
  // Sticky spills (slow you down)
  const sticky = [
    { x: -1.5, z: 15,    r: 1.4 },
    { x:  8.5, z: 21.25, r: 1.3 },
    { x: -7,   z: 28,    r: 1.5 },
    { x:  7,   z: 34,    r: 1.2 },
    { x: -9,   z: 9.25,  r: 1.2 },
  ];
  // Open cellar hatches (fall in = lose your whole tray). Square, `half` = half the side length.
  const holes = [
    { x:  1.5,  z: 12,   half: 0.8 },
    { x: -6.5,  z: 18.5, half: 0.8 },
    { x:  7,    z: 30,   half: 0.8 },
    { x: -10.5, z: 23,   half: 0.8 },
  ];
  const spawns = [
    { x: -2.25, z: 2.75 },  // you, right at the counter
    { x: -6.75, z: 2.75 },
    { x:  2.25, z: 2.75 },
    { x:  6.75, z: 2.75 },
  ];
  // Where AI rivals line up to order (gaps between the bar stools)
  const barSlots = [-11, -6.75, -2.25, 2.25, 6.75, 11];

  HMB.MAP = { tables, stools, people, walkerRoutes, sticky, holes, spawns, barSlots };

  // Static collision circles
  HMB.obstacles = [
    ...tables.map((t) => ({ x: t.x, z: t.z, r: t.r, kind: 'table' })),
    ...stools.map((s) => ({ x: s.x, z: s.z, r: 0.24, kind: 'stool', soft: !!s.bar })),
    ...people.map((p) => ({ x: p.x, z: p.z, r: 0.36, kind: 'person' })),
  ];

  HMB.onSticky = (x, z) => sticky.some((s) => Math.hypot(x - s.x, z - s.z) < s.r);
  // A player falls in when their centre is over the hatch opening
  HMB.holeAt = (x, z, margin) => holes.find((h) =>
    Math.abs(x - h.x) < h.half - (margin || 0) && Math.abs(z - h.z) < h.half - (margin || 0));

  // ---------------------------------------------------------------- helpers
  function canvasTex(w, h, draw, rx, ry) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx || 1, ry || 1);
    t.anisotropy = 4;
    return t;
  }
  HMB.canvasTex = canvasTex;

  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const DISPLAY_FONT = '"Lilita One", "Arial Rounded MT Bold", "Trebuchet MS", sans-serif';

  // Text on a camera-facing sprite (name tags, floating points).
  HMB.textSprite = function (text, o) {
    o = o || {};
    const size = o.size || 64, pad = o.pad == null ? 18 : o.pad;
    const c = document.createElement('canvas');
    const g = c.getContext('2d');
    const font = `${size}px ${o.font || DISPLAY_FONT}`;
    g.font = font;
    const tw = g.measureText(text).width;
    c.width = Math.ceil(tw + pad * 2);
    c.height = Math.ceil(size * 1.45);
    g.font = font;
    if (o.bg) {
      g.fillStyle = o.bg;
      roundRect(g, 2, 2, c.width - 4, c.height - 4, Math.min(24, c.height / 2 - 2));
      g.fill();
    }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    if (o.stroke) {
      g.lineJoin = 'round';
      g.lineWidth = o.strokeWidth || 10;
      g.strokeStyle = o.stroke;
      g.strokeText(text, c.width / 2, c.height / 2 + size * 0.04);
    }
    g.fillStyle = o.color || '#fff3d6';
    g.fillText(text, c.width / 2, c.height / 2 + size * 0.04);
    const tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: o.depthTest !== false, depthWrite: false });
    const s = new THREE.Sprite(mat);
    const h = o.height || 0.4;
    s.scale.set((h * c.width) / c.height, h, 1);
    s.renderOrder = o.renderOrder || 10;
    return s;
  };

  function tableBadge(points) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2);
    g.fillStyle = '#fff3d6'; g.fill();
    g.lineWidth = 14; g.strokeStyle = '#f4a72c'; g.stroke();
    g.beginPath(); g.arc(128, 128, 96, 0, Math.PI * 2);
    g.lineWidth = 3; g.strokeStyle = 'rgba(36,20,9,0.25)'; g.stroke();
    g.fillStyle = '#241409';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `128px ${DISPLAY_FONT}`;
    g.fillText(points + '×', 132, 120);
    g.font = `800 26px "Nunito", sans-serif`;
    g.fillStyle = '#7a5a3a';
    g.fillText('PER BEER', 128, 196);
    const tex = new THREE.CanvasTexture(c);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
    s.scale.set(1.5, 1.5, 1);
    s.renderOrder = 5;
    return s;
  }

  const lambert = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));

  // ---------------------------------------------------------------- walking customers
  class Walker {
    constructor(scene, def, i) {
      this.route = def.route;
      this.idx = 1;
      this.x = def.route[0].x;
      this.z = def.route[0].z;
      this.vx = 0; this.vz = 0;
      this.r = 0.36;
      this.waitT = 0;
      this.blockedT = 0;
      this.phase = i * 1.3;
      this.fig = HMB.buildFigure({ shirt: def.shirt, pants: 0x2b2633, hair: [0x2a1a0e, 0xb08040, 0x111111, 0x6b4a2a][i % 4], pint: true });
      scene.add(this.fig.root);
      this.sync(0);
    }
    reset() {
      this.idx = 1;
      this.x = this.route[0].x;
      this.z = this.route[0].z;
      this.vx = this.vz = 0;
      this.waitT = 0;
    }
    update(dt, others) {
      const tgt = this.route[this.idx];
      let dx = tgt.x - this.x, dz = tgt.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1) {
        this.idx = (this.idx + 1) % this.route.length;
        this.waitT = 0.8 + Math.random() * 1.2;   // pause at the end of the route
      }
      if (this.waitT > 0) { this.waitT -= dt; this.vx = this.vz = 0; return; }
      dx /= d || 1; dz /= d || 1;
      // Politely stop for someone right in front, but not forever
      let blocked = false;
      for (const o of others) {
        if (o === this) continue;
        const ox = o.x - this.x, oz = o.z - this.z, od = Math.hypot(ox, oz);
        if (od < 1.1 && (ox * dx + oz * dz) / (od || 1) > 0.6) { blocked = true; break; }
      }
      this.blockedT = blocked ? this.blockedT + dt : 0;
      const go = !blocked || this.blockedT > 1.5;
      const sp = go ? C.walkerSpeed : 0;
      this.vx = dx * sp; this.vz = dz * sp;
      this.x += this.vx * dt;
      this.z += this.vz * dt;
    }
    sync(t) {
      const f = this.fig;
      const sp = Math.hypot(this.vx, this.vz);
      if (sp > 0.1) f.body.rotation.y = Math.atan2(this.vx, this.vz);
      const swing = Math.sin(t * 7 + this.phase) * Math.min(1, sp) * 0.5;
      f.legL.rotation.x = swing;
      f.legR.rotation.x = -swing;
      f.root.position.set(this.x, 0, this.z);
    }
  }

  // ---------------------------------------------------------------- build
  HMB.buildWorld = function (scene) {
    const RM = C.room;
    const W = RM.maxX - RM.minX, D = RM.maxZ - RM.minZ, H = 6;
    const rnd = rng(42);

    // Lights: warm and low, like a pub after dark
    scene.add(new THREE.HemisphereLight(0xffe2b8, 0x3a2416, 1.0));
    const sun = new THREE.DirectionalLight(0xffd59a, 0.55);
    sun.position.set(-6, 14, 30);
    scene.add(sun);
    const barLight = new THREE.PointLight(0xffb45a, 0.9, 16, 2);
    barLight.position.set(0, 3.4, 2.4);
    scene.add(barLight);

    // Floor: wooden planks
    const floorTex = canvasTex(512, 512, (g, w, h) => {
      const r = rng(7);
      const ph = 64;
      for (let y = 0; y < h; y += ph) {
        let x = -Math.floor(r() * 220);
        while (x < w) {
          const len = 170 + r() * 230;
          const l = 21 + r() * 9;
          g.fillStyle = `hsl(${22 + r() * 8}, ${36 + r() * 10}%, ${l}%)`;
          g.fillRect(x, y, len, ph);
          g.strokeStyle = `hsla(25, 40%, ${l - 8}%, 0.5)`;
          g.lineWidth = 1;
          for (let k = 0; k < 5; k++) {
            const yy = y + 8 + r() * (ph - 16);
            g.beginPath(); g.moveTo(x, yy);
            g.bezierCurveTo(x + len * 0.3, yy + r() * 6 - 3, x + len * 0.6, yy + r() * 6 - 3, x + len, yy);
            g.stroke();
          }
          g.fillStyle = 'rgba(10,5,2,0.85)';
          g.fillRect(x, y, 3, ph);
          x += len;
        }
        g.fillStyle = 'rgba(10,5,2,0.9)';
        g.fillRect(0, y, w, 3);
      }
    }, W / 4.5, D / 4.5);

    // Walls: brick above, dark wood wainscot below
    const wallDraw = (g, w, h) => {
      g.fillStyle = '#3c1f17';
      g.fillRect(0, 0, w, h);
      const r = rng(11);
      const bh = 22, bw = 64;
      for (let y = 0, row = 0; y < h * 0.62; y += bh, row++) {
        for (let x = -(row % 2) * bw / 2; x < w; x += bw) {
          g.fillStyle = `hsl(${10 + r() * 10}, ${38 + r() * 14}%, ${20 + r() * 9}%)`;
          g.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        }
      }
      const wy = h * 0.62;
      g.fillStyle = '#2a170e';
      g.fillRect(0, wy, w, h - wy);
      g.fillStyle = '#4a2c18';
      g.fillRect(0, wy, w, 8);
      for (let x = 0; x < w; x += 64) {
        g.strokeStyle = 'rgba(0,0,0,0.45)';
        g.lineWidth = 2;
        g.strokeRect(x + 8, wy + 18, 48, h - wy - 30);
      }
    };
    const wallTexLong = canvasTex(512, 256, wallDraw, D / 4, 1);
    const wallTexShort = canvasTex(512, 256, wallDraw, W / 4, 1);
    const wallLong = lambert(0xffffff, { map: wallTexLong, side: THREE.BackSide });
    const wallShort = lambert(0xffffff, { map: wallTexShort, side: THREE.BackSide });
    const ceiling = lambert(0x1d120c, { side: THREE.BackSide });
    const floor = lambert(0xffffff, { map: floorTex, side: THREE.BackSide });
    // Seen from above, the walls nearest the camera and the ceiling are back-face culled: a dollhouse view.
    const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [wallLong, wallLong, ceiling, floor, wallShort, wallShort]);
    room.position.set((RM.minX + RM.maxX) / 2, H / 2, (RM.minZ + RM.maxZ) / 2);
    scene.add(room);
    // Dark ground around the building, so the camera never looks into a void
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: 0x0e0906 }));
    outside.rotation.x = -Math.PI / 2;
    outside.position.set(0, -0.05, D / 2);
    scene.add(outside);

    // ---- the bar counter
    const counterDepth = 1.0, counterH = 1.08;
    const frontTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#4a2814'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        g.fillStyle = x % 64 ? '#552f18' : '#4f2b16';
        g.fillRect(x + 2, 6, 28, h - 12);
      }
      g.fillStyle = '#2e180b'; g.fillRect(0, h - 10, w, 10);
    }, 16, 1);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(W - 0.8, counterH, counterDepth), lambert(0xffffff, { map: frontTex }));
    counter.position.set(0, counterH / 2, C.barFrontZ - counterDepth / 2);
    scene.add(counter);
    const top = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.07, counterDepth + 0.16), lambert(0x8a4a1f));
    top.position.set(0, counterH + 0.035, C.barFrontZ - counterDepth / 2 + 0.03);
    scene.add(top);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, W - 1, 8), lambert(0xd4a64a, { emissive: 0x2a1a00 }));
    rail.rotation.z = Math.PI / 2;
    rail.position.set(0, 0.2, C.barFrontZ + 0.08);
    scene.add(rail);

    // Beer taps
    const chrome = lambert(0xd8d2c4, { emissive: 0x222018 });
    const handleCols = [0xf4a72c, 0x2b1b12, 0xe5533d, 0x6fcf7b];
    [-8.5, -4.2, 0, 4.2, 8.5].forEach((tx, i) => {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.18), chrome);
      base.position.set(tx, counterH + 0.5, C.barFrontZ - 0.45);
      scene.add(base);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.45, 8), chrome);
      post.position.set(tx, counterH + 0.25, C.barFrontZ - 0.45);
      scene.add(post);
      for (let k = -1; k <= 1; k++) {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.02, 0.28, 8), lambert(handleCols[(i + k + 4) % 4]));
        h.position.set(tx + k * 0.28, counterH + 0.7, C.barFrontZ - 0.45);
        scene.add(h);
      }
    });

    // Back bar: shelves of bottles + mirror
    const mirror = new THREE.Mesh(new THREE.PlaneGeometry(W - 3, 1.7), new THREE.MeshBasicMaterial({ color: 0x3a2a22 }));
    mirror.position.set(0, 2.05, 0.03);
    scene.add(mirror);
    const shelfMat = lambert(0x5a3218);
    const shelfYs = [1.38, 2.08];
    shelfYs.forEach((y) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(W - 2.6, 0.05, 0.34), shelfMat);
      s.position.set(0, y, 0.2);
      scene.add(s);
    });
    const bottleCount = 96;
    const bottleGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.32, 8);
    bottleGeo.translate(0, 0.16, 0);
    const bottles = new THREE.InstancedMesh(bottleGeo, lambert(0xffffff, { emissive: 0x111111 }), bottleCount);
    const bottleCols = [0x2f6b3a, 0x6b3a1a, 0xc98a2b, 0x8fb9c6, 0x7a1f2b, 0xd9cfa8, 0x24452e];
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    const shelfW = W - 3.2;
    for (let i = 0; i < bottleCount; i++) {
      const row = i % 2;
      const x = -shelfW / 2 + (Math.floor(i / 2) / (bottleCount / 2)) * shelfW + rnd() * 0.12;
      const sc = 0.8 + rnd() * 0.5;
      m4.makeScale(1, sc, 1).setPosition(x, shelfYs[row] + 0.025, 0.16 + rnd() * 0.08);
      bottles.setMatrixAt(i, m4);
      bottles.setColorAt(i, col.setHex(bottleCols[Math.floor(rnd() * bottleCols.length)]));
    }
    scene.add(bottles);

    // Neon sign
    const neonTex = canvasTex(1024, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.font = `150px ${DISPLAY_FONT}`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = '#ff9a2e'; g.shadowBlur = 40;
      g.fillStyle = '#ffd27a';
      g.fillText('HOLD MY BEER', w / 2, h / 2 + 6);
      g.shadowBlur = 12;
      g.fillText('HOLD MY BEER', w / 2, h / 2 + 6);
    });
    neonTex.wrapS = neonTex.wrapT = THREE.ClampToEdgeWrapping;
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, depthWrite: false }));
    neon.position.set(0, 3.3, 0.05);
    scene.add(neon);

    // Ordering zone glow on the floor in front of the bar
    const zoneDepth = C.barReach + C.playerRadius;
    const zoneTex = canvasTex(64, 64, (g, w, h) => {
      const grd = g.createLinearGradient(0, 0, 0, h);
      grd.addColorStop(0, 'rgba(244,167,44,0.55)');
      grd.addColorStop(1, 'rgba(244,167,44,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    zoneTex.wrapS = zoneTex.wrapT = THREE.ClampToEdgeWrapping;
    const barZone = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.8, zoneDepth),
      new THREE.MeshBasicMaterial({ map: zoneTex, transparent: true, opacity: 0.5, depthWrite: false }));
    barZone.rotation.x = -Math.PI / 2;
    barZone.position.set(0, 0.012, C.barFrontZ + zoneDepth / 2);
    scene.add(barZone);

    // Safe-zone line: nobody can hit you between here and the bar
    const safeTex = canvasTex(64, 8, (g, w, h) => {
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(127,216,232,0.9)';
      g.fillRect(0, 0, w * 0.6, h);   // dashes
    }, (W - 0.8) / 1.2, 1);
    const safeLine = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.8, 0.12),
      new THREE.MeshBasicMaterial({ map: safeTex, transparent: true, opacity: 0.55, depthWrite: false }));
    safeLine.rotation.x = -Math.PI / 2;
    scene.add(safeLine);

    // Bartender
    const bartender = HMB.buildFigure({ shirt: 0x1e1e1e, pants: 0x1e1e1e, hair: 0x5a3a1a, apron: true });
    bartender.root.position.set(0, 0, 0.55);
    scene.add(bartender.root);

    // ---- sticky spills
    const stickyTex = canvasTex(256, 256, (g, w, h) => {
      const r = rng(5);
      g.clearRect(0, 0, w, h);
      // irregular blob made of overlapping circles
      g.fillStyle = 'rgba(122,72,14,0.88)';
      for (let i = 0; i < 14; i++) {
        const a = r() * Math.PI * 2, d = r() * 50;
        g.beginPath();
        g.arc(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 45 + r() * 30, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(176,110,24,0.7)';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(110 + r() * 40, 110 + r() * 40, 20 + r() * 26, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = 'rgba(255,230,170,0.55)';   // glossy highlights
      for (let i = 0; i < 9; i++) {
        g.beginPath();
        g.ellipse(80 + r() * 100, 80 + r() * 100, 3 + r() * 8, 2 + r() * 4, r() * 3, 0, Math.PI * 2);
        g.fill();
      }
    });
    stickyTex.wrapS = stickyTex.wrapT = THREE.ClampToEdgeWrapping;
    const stickyMat = new THREE.MeshBasicMaterial({ map: stickyTex, transparent: true, depthWrite: false });
    sticky.forEach((s, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s.r * 2.3, s.r * 2.3), stickyMat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = i * 1.3;
      m.position.set(s.x, 0.013, s.z);
      scene.add(m);
    });

    // ---- open cellar hatches
    const pitTex = canvasTex(128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.7);
      grd.addColorStop(0, '#000000');
      grd.addColorStop(1, '#1c120b');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,80,40,0.35)';   // ladder rungs disappearing into the dark
      for (let y = 18; y < h - 30; y += 22) g.fillRect(44, y, 40, 5);
    });
    pitTex.wrapS = pitTex.wrapT = THREE.ClampToEdgeWrapping;
    const stripeTex = canvasTex(64, 16, (g, w, h) => {
      g.fillStyle = '#f4c21c'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#1a1410';
      for (let x = -16; x < w; x += 16) {
        g.beginPath(); g.moveTo(x, h); g.lineTo(x + 8, 0); g.lineTo(x + 16, 0); g.lineTo(x + 8, h); g.fill();
      }
    }, 4, 1);
    const pitMat = new THREE.MeshBasicMaterial({ map: pitTex });
    const stripeMat = lambert(0xffffff, { map: stripeTex });
    const doorMat = lambert(0x5a3218);
    holes.forEach((hl, i) => {
      const g = new THREE.Group();
      g.position.set(hl.x, 0, hl.z);
      const s = hl.half * 2;
      const pit = new THREE.Mesh(new THREE.PlaneGeometry(s, s), pitMat);
      pit.rotation.x = -Math.PI / 2;
      pit.position.y = 0.014;
      g.add(pit);
      // hazard-striped frame
      const t = 0.12;
      [[0, -hl.half, s + t, t], [0, hl.half, s + t, t], [-hl.half, 0, t, s], [hl.half, 0, t, s]].forEach(([fx, fz, w, d]) => {
        const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), stripeMat);
        f.position.set(fx, 0.025, fz);
        g.add(f);
      });
      // trapdoor flipped open
      const hinge = new THREE.Group();
      hinge.position.set(0, 0.05, -hl.half - t / 2);
      const door = new THREE.Mesh(new THREE.BoxGeometry(s, 0.06, s), doorMat);
      door.position.set(0, 0, -s / 2);
      hinge.add(door);
      hinge.rotation.x = 1.2;
      g.rotation.y = (i % 2) * Math.PI;
      g.add(hinge);
      scene.add(g);
    });

    // ---- tables, light pools, serve rings
    const tableWood = lambert(0x6b3b1c);
    const tableEdge = lambert(0x3a1f0e);
    const ironMat = lambert(0x1a1410);
    const poolTex = canvasTex(128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,200,120,0.5)');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    poolTex.wrapS = poolTex.wrapT = THREE.ClampToEdgeWrapping;
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });

    tables.forEach((t) => {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      const topM = new THREE.Mesh(new THREE.CylinderGeometry(t.r, t.r, 0.07, 32), tableWood);
      topM.position.y = 0.98;
      const edge = new THREE.Mesh(new THREE.TorusGeometry(t.r, 0.035, 6, 32), tableEdge);
      edge.rotation.x = Math.PI / 2; edge.position.y = 0.98;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.95, 10), ironMat);
      leg.position.y = 0.475;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.05, 16), ironMat);
      foot.position.y = 0.025;
      const candle = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 8), lambert(0xf3e6c8));
      candle.position.set(0.25, 1.07, -0.1);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), flameMat);
      flame.position.set(0.25, 1.16, -0.1);
      g.add(topM, edge, leg, foot, candle, flame);

      const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), poolMat);
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.01;
      g.add(pool);

      // Serve ring: shows where you can serve from, lights up when you can
      const reach = t.r + C.playerRadius + C.serveReach;
      const ring = new THREE.Mesh(new THREE.RingGeometry(reach - 0.08, reach, 48),
        new THREE.MeshBasicMaterial({ color: 0xf4a72c, transparent: true, opacity: 0.18, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015;
      g.add(ring);

      const badge = tableBadge(t.points);
      badge.position.y = 2.4;
      g.add(badge);

      scene.add(g);
      t.group = g; t.badge = badge; t.ring = ring;
      t.topY = 1.02;
    });

    // Stools
    const seatMat = lambert(0x8e2a1e);
    const stoolGeoSeat = new THREE.CylinderGeometry(0.24, 0.22, 0.08, 16);
    const stoolGeoLeg = new THREE.CylinderGeometry(0.035, 0.05, 0.7, 6);
    const stoolGeoRing = new THREE.TorusGeometry(0.17, 0.018, 6, 16);
    stools.forEach((s) => {
      const g = new THREE.Group();
      const seat = new THREE.Mesh(stoolGeoSeat, seatMat); seat.position.y = 0.74;
      const leg = new THREE.Mesh(stoolGeoLeg, ironMat); leg.position.y = 0.35;
      const ring = new THREE.Mesh(stoolGeoRing, ironMat); ring.rotation.x = Math.PI / 2; ring.position.y = 0.28;
      g.add(seat, leg, ring);
      g.position.set(s.x, 0, s.z);
      scene.add(g);
    });

    // Standing customers (static obstacles that idle in place)
    const patronFigs = people.map((p, i) => {
      const f = HMB.buildFigure({ shirt: p.shirt, pants: 0x2b2633, hair: [0x2a1a0e, 0x6b4a2a, 0x111111, 0xb08040][i % 4], pint: true });
      f.root.position.set(p.x, 0, p.z);
      f.body.rotation.y = p.face;
      f.phase = i * 1.7;
      f.baseFace = p.face;
      scene.add(f.root);
      return f;
    });

    // Walking customers
    const walkers = walkerRoutes.map((def, i) => new Walker(scene, def, i));

    // Posters on the side walls
    const posterCols = [0xe5533d, 0xf4a72c, 0x4f8de0, 0x6fcf7b];
    [6, 14, 22, 30].forEach((z, i) => {
      [RM.minX + 0.02, RM.maxX - 0.02].forEach((x, j) => {
        const p = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.5), lambert(posterCols[(i + j) % 4]));
        p.position.set(x, 2.6, z + j);
        p.rotation.y = j ? -Math.PI / 2 : Math.PI / 2;
        scene.add(p);
        const frame = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.65), lambert(0x1a100a));
        frame.position.copy(p.position).x += j ? 0.005 : -0.005;
        frame.rotation.y = p.rotation.y;
        scene.add(frame);
      });
    });

    // Floor markings that depend on tweakable numbers; rebuilt when settings change
    function applyConfig() {
      safeLine.position.set(0, 0.016, C.barFrontZ + C.playerRadius + C.barSafeDistance);
      safeLine.visible = C.barSafeDistance > 0;
      tables.forEach((t) => {
        const reach = t.r + C.playerRadius + C.serveReach;
        t.ring.geometry.dispose();
        t.ring.geometry = new THREE.RingGeometry(reach - 0.08, reach, 48);
      });
    }
    applyConfig();

    return {
      tables,
      barZone,
      bartender,
      walkers,
      applyConfig,
      resetWalkers() { walkers.forEach((w) => w.reset()); },
      updateWalkers(dt, chars) {
        const others = [...chars, ...walkers];
        walkers.forEach((w) => w.update(dt, others));
      },
      update(dt, t, chars, human) {
        // Bartender drifts to whoever is closest to the counter
        let tx = 0, best = 1e9;
        chars.forEach((c) => {
          const d = c.z - C.barFrontZ;
          if (d < C.barReach + 1 && d < best) { best = d; tx = c.x; }
        });
        tx = Math.max(-11, Math.min(11, tx));
        const bx = bartender.root.position.x;
        bartender.root.position.x += (tx - bx) * Math.min(1, dt * 2.5);
        bartender.body.rotation.y = Math.sin(t * 0.7) * 0.2;
        bartender.legL.rotation.x = Math.sin(t * 8) * Math.min(0.5, Math.abs(tx - bx));
        bartender.legR.rotation.x = -bartender.legL.rotation.x;

        tables.forEach((tb, i) => {
          tb.badge.position.y = 2.4 + Math.sin(t * 2 + i) * 0.08;
          // Cooling down after a serve: dim badge, grey ring that shrinks back as it gets ready
          const cooling = tb.cooldownT > 0;
          tb.badge.material.opacity = cooling ? 0.35 : 1;
          tb.ring.material.color.setHex(cooling ? 0x9a8f80 : 0xf4a72c);
          const k = cooling ? 1 - tb.cooldownT / Math.max(0.01, C.tableCooldownSeconds) : 1;
          tb.ring.scale.setScalar(cooling ? 0.55 + 0.45 * k : 1);
        });
        patronFigs.forEach((f) => {
          f.lean.rotation.z = Math.sin(t * 0.9 + f.phase) * 0.05;
          f.body.rotation.y = f.baseFace + Math.sin(t * 0.3 + f.phase) * 0.35;
        });
        walkers.forEach((w) => w.sync(t));

        // Highlight what you can do right now
        if (human) {
          const atBar = human.inBarZone();
          barZone.material.opacity = atBar ? 0.75 + Math.sin(t * 6) * 0.2 : 0.4;
          tables.forEach((tb) => {
            const near = human.beers > 0 && HMB.G.servableTable(human) === tb;
            if (tb.cooldownT > 0) tb.ring.material.opacity = 0.55;
            else tb.ring.material.opacity = near ? 0.65 + Math.sin(t * 8) * 0.25 : (human.beers > 0 ? 0.22 : 0.1);
          });
        }
      },
    };
  };
})();
