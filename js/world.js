// The bar: a fixed map (never randomised), its obstacles, and all the 3D set dressing.
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
  const tables = [
    { x: -5.5, z: 6.0,  r: 0.85, points: 1, stools: [3.6, 1.2] },
    { x:  2.0, z: 5.5,  r: 0.85, points: 1, stools: [5.8, 2.2] },
    { x: -3.0, z: 11.0, r: 0.9,  points: 2, stools: [0.3, 3.9] },
    { x:  5.5, z: 10.5, r: 0.9,  points: 2, stools: [2.6, 5.2] },
    { x:  0.0, z: 16.5, r: 0.9,  points: 3, stools: [1.0, 4.4] },
    { x:  5.5, z: 21.0, r: 0.95, points: 4, stools: [3.3, 0.6] },
    { x: -6.0, z: 23.0, r: 0.95, points: 5, stools: [5.6, 2.0] },
  ];
  const stools = [
    { x: -6.5, z: 2.05 }, { x: -3.0, z: 2.05 }, { x: 3.0, z: 2.05 }, { x: 6.5, z: 2.05 },  // bar stools
  ];
  tables.forEach((t) => t.stools.forEach((a) => {
    stools.push({ x: t.x + Math.cos(a) * (t.r + 0.42), z: t.z + Math.sin(a) * (t.r + 0.42) });
  }));
  const people = [
    { x: -1.6, z: 8.3,  face: 2.2, shirt: 0x8a6d4b },
    { x:  3.8, z: 14.2, face: 4.0, shirt: 0x5c7a6a },
    { x: -5.4, z: 16.6, face: 0.6, shirt: 0xb5835a },
    { x:  2.6, z: 24.3, face: 3.4, shirt: 0x6b5b8a },
    { x: -7.8, z: 11.6, face: 1.4, shirt: 0x9a4f4f },
    { x:  8.0, z: 16.4, face: 4.6, shirt: 0x4f6f8a },
    { x: -2.6, z: 20.2, face: 5.5, shirt: 0x8a8a4b },
  ];
  const spawns = [
    { x: -1.2, z: 2.75 },  // you, right at the counter
    { x: -4.8, z: 2.75 },
    { x:  1.6, z: 2.75 },
    { x:  4.8, z: 2.75 },
  ];
  // Where AI rivals line up to order (gaps between the bar stools)
  const barSlots = [-8, -4.75, -1.4, 1.4, 4.75, 8];

  HMB.MAP = { tables, stools, people, spawns, barSlots };

  // Static collision circles
  HMB.obstacles = [
    ...tables.map((t) => ({ x: t.x, z: t.z, r: t.r, kind: 'table' })),
    ...stools.map((s) => ({ x: s.x, z: s.z, r: 0.24, kind: 'stool' })),
    ...people.map((p) => ({ x: p.x, z: p.z, r: 0.36, kind: 'person' })),
  ];

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
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.scale.set(0.95, 0.95, 1);
    s.renderOrder = 5;
    return s;
  }

  const lambert = (color, extra) => new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));

  // ---------------------------------------------------------------- build
  HMB.buildWorld = function (scene) {
    const R = C.room;
    const W = R.maxX - R.minX, D = R.maxZ - R.minZ, H = 4.2;
    const rnd = rng(42);

    // Lights: warm and low, like a pub after dark
    scene.add(new THREE.HemisphereLight(0xffe2b8, 0x3a2416, 0.95));
    const sun = new THREE.DirectionalLight(0xffd59a, 0.55);
    sun.position.set(-4, 10, 18);
    scene.add(sun);
    const barLight = new THREE.PointLight(0xffb45a, 0.9, 14, 2);
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
    const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [wallLong, wallLong, ceiling, floor, wallShort, wallShort]);
    room.position.set((R.minX + R.maxX) / 2, H / 2, (R.minZ + R.maxZ) / 2);
    scene.add(room);

    // Ceiling beams
    const beamMat = lambert(0x24150c);
    for (let z = 3; z < D; z += 4.5) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(W, 0.25, 0.3), beamMat);
      beam.position.set(0, H - 0.12, z);
      scene.add(beam);
    }

    // ---- the bar counter
    const counterDepth = 1.0, counterH = 1.08;
    const frontTex = canvasTex(256, 128, (g, w, h) => {
      g.fillStyle = '#4a2814'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 32) {
        g.fillStyle = x % 64 ? '#552f18' : '#4f2b16';
        g.fillRect(x + 2, 6, 28, h - 12);
      }
      g.fillStyle = '#2e180b'; g.fillRect(0, h - 10, w, 10);
    }, 12, 1);
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
    [-5.2, -1.8, 1.8, 5.2].forEach((tx, i) => {
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
    const bottleCount = 64;
    const bottleGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.32, 8);
    bottleGeo.translate(0, 0.16, 0);
    const bottles = new THREE.InstancedMesh(bottleGeo, lambert(0xffffff, { emissive: 0x111111 }), bottleCount);
    const bottleCols = [0x2f6b3a, 0x6b3a1a, 0xc98a2b, 0x8fb9c6, 0x7a1f2b, 0xd9cfa8, 0x24452e];
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < bottleCount; i++) {
      const row = i % 2;
      const x = -7.4 + (Math.floor(i / 2) / (bottleCount / 2)) * 14.8 + rnd() * 0.12;
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
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 1.6), new THREE.MeshBasicMaterial({ map: neonTex, transparent: true, depthWrite: false }));
    neon.position.set(0, 3.4, 0.05);
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

    // Bartender
    const bartender = HMB.buildFigure({ shirt: 0x1e1e1e, pants: 0x1e1e1e, hair: 0x5a3a1a, apron: true });
    bartender.root.position.set(0, 0, 0.55);
    scene.add(bartender.root);

    // ---- tables, lamps, light pools, serve rings
    const tableWood = lambert(0x6b3b1c);
    const tableEdge = lambert(0x3a1f0e);
    const ironMat = lambert(0x1a1410);
    const poolTex = canvasTex(128, 128, (g, w, h) => {
      const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      grd.addColorStop(0, 'rgba(255,200,120,0.55)');
      grd.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    });
    poolTex.wrapS = poolTex.wrapT = THREE.ClampToEdgeWrapping;
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const shadeMat = lambert(0x2f4a3a, { side: THREE.DoubleSide });
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });

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
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 6), bulbMat);
      flame.position.set(0.25, 1.16, -0.1);
      g.add(topM, edge, leg, foot, candle, flame);

      // Lamp
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, H - 3.2, 4), ironMat);
      cord.position.y = (H + 3.2) / 2;
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.26, 16, 1, true), shadeMat);
      shade.position.y = 3.2;
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), bulbMat);
      bulb.position.y = 3.08;
      g.add(cord, shade, bulb);

      const pool = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.2), poolMat);
      pool.rotation.x = -Math.PI / 2; pool.position.y = 0.01;
      g.add(pool);

      // Serve ring: shows where you can serve from, lights up when you can
      const reach = t.r + C.playerRadius + C.serveReach;
      const ring = new THREE.Mesh(new THREE.RingGeometry(reach - 0.07, reach, 48),
        new THREE.MeshBasicMaterial({ color: 0xf4a72c, transparent: true, opacity: 0.18, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.015;
      g.add(ring);

      const badge = tableBadge(t.points);
      badge.position.y = 2.25;
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

    // Patrons (static obstacles that idle in place)
    const patronFigs = people.map((p, i) => {
      const f = HMB.buildFigure({ shirt: p.shirt, pants: 0x2b2633, hair: [0x2a1a0e, 0x6b4a2a, 0x111111, 0xb08040][i % 4], pint: true });
      f.root.position.set(p.x, 0, p.z);
      f.body.rotation.y = p.face;
      f.phase = i * 1.7;
      f.baseFace = p.face;
      scene.add(f.root);
      return f;
    });

    // Posters on the side walls
    const posterCols = [0xe5533d, 0xf4a72c, 0x4f8de0, 0x6fcf7b];
    [5, 12, 19].forEach((z, i) => {
      [R.minX + 0.02, R.maxX - 0.02].forEach((x, j) => {
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

    return {
      tables,
      barZone,
      bartender,
      update(dt, t, chars, human) {
        // Bartender drifts to whoever is closest to the counter
        let tx = 0, best = 1e9;
        chars.forEach((c) => {
          const d = c.z - C.barFrontZ;
          if (d < C.barReach + 1 && d < best) { best = d; tx = c.x; }
        });
        tx = Math.max(-7.5, Math.min(7.5, tx));
        const bx = bartender.root.position.x;
        bartender.root.position.x += (tx - bx) * Math.min(1, dt * 2.5);
        bartender.body.rotation.y = Math.sin(t * 0.7) * 0.2;
        bartender.legL.rotation.x = Math.sin(t * 8) * Math.min(0.5, Math.abs(tx - bx));
        bartender.legR.rotation.x = -bartender.legL.rotation.x;

        tables.forEach((tb, i) => {
          tb.badge.position.y = 2.25 + Math.sin(t * 2 + i) * 0.06;
        });
        patronFigs.forEach((f) => {
          f.lean.rotation.z = Math.sin(t * 0.9 + f.phase) * 0.05;
          f.body.rotation.y = f.baseFace + Math.sin(t * 0.3 + f.phase) * 0.35;
        });

        // Highlight what you can do right now
        if (human) {
          const atBar = human.inBarZone();
          barZone.material.opacity = atBar ? 0.75 + Math.sin(t * 6) * 0.2 : 0.4;
          tables.forEach((tb) => {
            const near = human.beers > 0 && HMB.G.servableTable(human) === tb;
            tb.ring.material.opacity = near ? 0.65 + Math.sin(t * 8) * 0.25 : (human.beers > 0 ? 0.22 : 0.1);
          });
        }
      },
    };
  };
})();
