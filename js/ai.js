// AI rivals: grid pathfinding around the fixed map + a small state machine per bot.
(function () {
  const C = HMB.CONFIG;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));

  // ------------------------------------------------------------ nav grid
  class MinHeap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(node, f) {
      const a = this.a;
      a.push([f, node]);
      let i = a.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (a[p][0] <= a[i][0]) break;
        [a[p], a[i]] = [a[i], a[p]];
        i = p;
      }
    }
    pop() {
      const a = this.a;
      const top = a[0];
      const last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top[1];
    }
  }

  class NavGrid {
    constructor() {
      const R = C.room;
      this.cell = 0.5;
      this.ox = R.minX;
      this.oz = R.minZ;
      this.cols = Math.round((R.maxX - R.minX) / this.cell);
      this.rows = Math.round((R.maxZ - R.minZ) / this.cell);
      this.blocked = new Uint8Array(this.cols * this.rows);
      this.cost = new Float32Array(this.cols * this.rows).fill(1);
      const pad = C.playerRadius + 0.12;
      for (let cz = 0; cz < this.rows; cz++) {
        for (let cx = 0; cx < this.cols; cx++) {
          const p = this.center(cx, cz);
          let b = p.x < R.minX + pad || p.x > R.maxX - pad || p.z < C.barFrontZ + pad || p.z > R.maxZ - pad;
          if (!b) {
            for (const o of HMB.obstacles) {
              if (Math.hypot(p.x - o.x, p.z - o.z) < o.r + pad) { b = true; break; }
            }
          }
          // Keep well clear of open cellar hatches
          if (!b && HMB.MAP.holes.some((h) => Math.abs(p.x - h.x) < h.half + 0.6 && Math.abs(p.z - h.z) < h.half + 0.6)) b = true;
          this.blocked[cz * this.cols + cx] = b ? 1 : 0;
          // Sticky spills are walkable but slow, so paths prefer to go around
          if (HMB.MAP.sticky.some((s) => Math.hypot(p.x - s.x, p.z - s.z) < s.r + 0.2)) this.cost[cz * this.cols + cx] = 3.5;
        }
      }
    }
    center(cx, cz) { return { x: this.ox + (cx + 0.5) * this.cell, z: this.oz + (cz + 0.5) * this.cell }; }
    toCell(x, z) {
      return {
        cx: Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.ox) / this.cell))),
        cz: Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.oz) / this.cell))),
      };
    }
    free(cx, cz) {
      return cx >= 0 && cz >= 0 && cx < this.cols && cz < this.rows && !this.blocked[cz * this.cols + cx];
    }
    freeAt(x, z) { const c = this.toCell(x, z); return this.free(c.cx, c.cz); }
    clearAt(x, z) {   // free and not sticky (used to smooth paths without cutting across spills)
      const c = this.toCell(x, z);
      return this.free(c.cx, c.cz) && this.cost[c.cz * this.cols + c.cx] <= 1;
    }
    nearestFree(cx, cz) {
      if (this.free(cx, cz)) return { cx, cz };
      for (let r = 1; r < 8; r++) {
        let best = null, bd = 1e9;
        for (let dz = -r; dz <= r; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
            if (this.free(cx + dx, cz + dz)) {
              const d = dx * dx + dz * dz;
              if (d < bd) { bd = d; best = { cx: cx + dx, cz: cz + dz }; }
            }
          }
        }
        if (best) return best;
      }
      return { cx, cz };
    }
    lineFree(ax, az, bx, bz) {
      const d = Math.hypot(bx - ax, bz - az);
      const steps = Math.ceil(d / (this.cell * 0.4));
      const startSticky = !this.clearAt(ax, az);
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        if (!this.freeAt(x, z)) return false;
        if (!startSticky && !this.clearAt(x, z)) return false;
      }
      return true;
    }
    findPath(sx, sz, tx, tz) {
      const s0 = this.toCell(sx, sz), t0 = this.toCell(tx, tz);
      const s = this.nearestFree(s0.cx, s0.cz), t = this.nearestFree(t0.cx, t0.cz);
      const cols = this.cols, n = cols * this.rows;
      const g = new Float32Array(n).fill(Infinity);
      const from = new Int32Array(n).fill(-1);
      const closed = new Uint8Array(n);
      const si = s.cz * cols + s.cx, ti = t.cz * cols + t.cx;
      const h = (cx, cz) => {
        const dx = Math.abs(cx - t.cx), dz = Math.abs(cz - t.cz);
        return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
      };
      const open = new MinHeap();
      g[si] = 0;
      open.push(si, h(s.cx, s.cz));
      let found = false;
      while (open.size) {
        const cur = open.pop();
        if (closed[cur]) continue;
        if (cur === ti) { found = true; break; }
        closed[cur] = 1;
        const cx = cur % cols, cz = (cur / cols) | 0;
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const nx = cx + dx, nz = cz + dz;
            if (!this.free(nx, nz)) continue;
            if (dx && dz && (!this.free(cx + dx, cz) || !this.free(cx, cz + dz))) continue;
            const ni = nz * cols + nx;
            if (closed[ni]) continue;
            const ng = g[cur] + (dx && dz ? Math.SQRT2 : 1) * this.cost[ni];
            if (ng < g[ni]) {
              g[ni] = ng;
              from[ni] = cur;
              open.push(ni, ng + h(nx, nz));
            }
          }
        }
      }
      if (!found) return [{ x: tx, z: tz }];
      const cells = [];
      for (let i = ti; i !== -1; i = from[i]) cells.push(this.center(i % cols, (i / cols) | 0));
      cells.reverse();
      // End exactly on the target when it is reachable
      if (this.freeAt(tx, tz)) cells[cells.length - 1] = { x: tx, z: tz };
      // String-pull: skip waypoints we can see past
      const out = [];
      let ax = sx, az = sz, i = 0;
      while (i < cells.length) {
        let j = cells.length - 1;
        while (j > i && !this.lineFree(ax, az, cells[j].x, cells[j].z)) j--;
        out.push(cells[j]);
        ax = cells[j].x; az = cells[j].z;
        i = j + 1;
      }
      return out;
    }
  }
  HMB.NavGrid = NavGrid;

  // ------------------------------------------------------------ bot brain
  const ZERO = { x: 0, z: 0 };

  class BotBrain {
    constructor(game, character, personality) {
      this.g = game;
      this.c = character;
      this.p = personality;
      this.reset();
    }

    reset() {
      this.state = 'toBar';
      this.path = null;
      this.goal = null;
      this.table = null;
      this.slot = null;
      this.tripTarget = 0;
      this.loadDelay = 0;
      this.serveDelay = 0;
      this.stuckT = 0;
      this.sideT = 0;
      this.side = ZERO;
      this.aim = null;
      this.thinkT = rand(0, 0.5);
      this.drinkThink = rand(0, 1);
      this.c.alert.visible = false;
    }

    setGoal(x, z) {
      this.goal = { x, z };
      this.path = this.g.nav.findPath(this.c.x, this.c.z, x, z);
    }

    pickBarSlot() {
      const taken = new Set(this.g.bots.filter((b) => b !== this && b.slot != null).map((b) => b.slot));
      let best = null, bd = 1e9;
      HMB.MAP.barSlots.forEach((x) => {
        if (taken.has(x)) return;
        const d = Math.abs(x - this.c.x) + rand(0, 2.5);
        if (d < bd) { bd = d; best = x; }
      });
      this.slot = best == null ? HMB.MAP.barSlots[0] : best;
      this.setGoal(this.slot, C.barFrontZ + C.playerRadius + 0.5);
    }

    chooseTable() {
      const c = this.c, p = this.p;
      let best = null, bv = -1;
      const others = new Set(this.g.bots.filter((b) => b !== this).map((b) => b.table));
      HMB.MAP.tables.forEach((t) => {
        const out = Math.hypot(t.x - c.x, t.z - c.z) * 1.15;
        const back = t.z - C.barFrontZ;
        const time = out / 3.4 + back / 3.8 + 1.2;
        let v = (c.beers * t.points) / time;
        v *= 1 + t.points * p.farBias;
        v *= rand(1 - p.random, 1 + p.random);
        if (others.has(t)) v *= 0.85;
        if (t.cooldownT > 0) v /= 1 + t.cooldownT * 0.5;   // still cooling down after a serve
        if (v > bv) { bv = v; best = t; }
      });
      this.table = best;
      this.goToTable();
    }

    goToTable() {
      const t = this.table, c = this.c, nav = this.g.nav;
      const base = Math.atan2(c.z - t.z, c.x - t.x);
      const ring = t.r + C.playerRadius + C.serveReach * 0.45;
      for (let k = 0; k < 16; k++) {
        const a = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.35 + rand(-0.1, 0.1);
        const x = t.x + Math.cos(a) * ring, z = t.z + Math.sin(a) * ring;
        if (nav.freeAt(x, z)) { this.setGoal(x, z); return; }
      }
      this.setGoal(t.x + Math.cos(base) * ring, t.z + Math.sin(base) * ring);
    }

    update(dt) {
      const c = this.c, g = this.g;
      if (c.fallT > 0) {
        // Fell into the cellar: re-plan from scratch once out
        this.aim = null;
        c.alert.visible = false;
        this.path = null;
        this.goal = null;
        this.table = null;
        this.state = 'toBar';
        return ZERO;
      }
      if (c.stunT > 0) {
        this.aim = null;
        c.alert.visible = false;
        return ZERO;
      }
      this.updateThrow(dt);

      switch (this.state) {
        case 'toBar': {
          if (!this.goal) this.pickBarSlot();
          const d = Math.hypot(this.goal.x - c.x, this.goal.z - c.z);
          if (c.inBarZone() && (d < 0.9 || !this.path.length)) {
            this.state = 'loading';
            // Personalities are tuned for a 10-beer tray; scale up when the tray holds more
            const scale = Math.max(1, C.maxBeers / 10);
            this.tripTarget = Math.min(C.maxBeers, Math.round(randInt(this.p.tripMin, this.p.tripMax) * scale));
            this.loadDelay = rand(0.15, 0.5);
            this.path = [];
            return ZERO;
          }
          break;
        }
        case 'loading': {
          if (!c.inBarZone()) { this.state = 'toBar'; this.goal = null; break; }
          if (c.beers >= this.tripTarget) {
            this.slot = null;
            this.state = 'toTable';
            this.chooseTable();
            break;
          }
          this.loadDelay -= dt;
          if (this.loadDelay <= 0 && c.getCd <= 0) {
            g.tryGetBeer(c);
            this.loadDelay = rand(0.15, 0.6);   // human-ish tapping rhythm
          }
          return this.hold();
        }
        case 'toTable': {
          if (c.beers === 0) { this.state = 'toBar'; this.goal = null; this.table = null; break; }
          if (g.servableTable(c) === this.table) {
            if (this.table.cooldownT > 0) {
              // Someone just served it: wait if it's nearly ready, otherwise pick another table
              if (this.table.cooldownT > 2.5) { this.chooseTable(); break; }
              return this.hold();
            }
            this.serveDelay += dt;
            if (this.serveDelay > 0.25) {
              g.tryServe(c, this.table);
              this.serveDelay = 0;
              this.state = 'toBar';
              this.goal = null;
              this.table = null;
            }
            return this.hold();
          }
          if (!this.path.length) this.goToTable();
          // Drink on the way sometimes (for the boost, shield and a glass to throw)
          this.drinkThink -= dt;
          if (this.drinkThink <= 0) {
            this.drinkThink = 1;
            const want = c.glasses === 0 ? this.p.drinkChance : this.p.drinkChance * 0.4;
            if (c.canDrink() && c.beers >= 3 && Math.random() < want) g.tryDrink(c);
          }
          break;
        }
      }
      return this.steer(dt);
    }

    // Steering needed to cancel the tray's drift (scaled by how good this bot is at balancing)
    counterSway() {
      const c = this.c;
      const k = (C.swayDrift / Math.max(0.5, c.maxSpeed())) * this.p.balance;
      return { x: -c.sway.x * k, z: -c.sway.z * k };
    }

    // Stand still while correcting the tray sway
    hold() { return this.counterSway(); }

    steer(dt) {
      const c = this.c, g = this.g;
      if (!this.path || !this.path.length) return this.hold();
      let wp = this.path[0];
      let dx = wp.x - c.x, dz = wp.z - c.z, d = Math.hypot(dx, dz);
      while (d < 0.45 && this.path.length > 1) {
        this.path.shift();
        wp = this.path[0];
        dx = wp.x - c.x; dz = wp.z - c.z; d = Math.hypot(dx, dz);
      }
      if (this.path.length === 1 && d < 0.2) { this.path.length = 0; return this.hold(); }
      let mag = this.p.lean;
      if (this.path.length === 1 && d < 1.6) mag *= Math.max(0.3, d / 1.6);
      let lx = (dx / d) * mag, lz = (dz / d) * mag;

      // Keep a little distance from other players and walking customers
      for (const o of g.movers()) {
        if (o === c) continue;
        const ox = c.x - o.x, oz = c.z - o.z, od = Math.hypot(ox, oz);
        if (od < 1.4 && od > 0.01) {
          const push = (1.4 - od) * 0.8;
          lx += (ox / od) * push;
          lz += (oz / od) * push;
        }
      }
      // Fight the tray sway
      const cs = this.counterSway();
      lx += cs.x;
      lz += cs.z;

      // Unstick: if barely moving for a second, sidestep and re-plan
      const sp = Math.hypot(c.vx, c.vz);
      this.stuckT = sp < 0.35 ? this.stuckT + dt : Math.max(0, this.stuckT - dt);
      if (this.stuckT > 1.0) {
        this.stuckT = 0;
        this.sideT = 0.6;
        const s = Math.random() < 0.5 ? 1 : -1;
        this.side = { x: (-dz / d) * s, z: (dx / d) * s };
        if (this.goal) this.path = g.nav.findPath(c.x, c.z, this.goal.x, this.goal.z);
      }
      if (this.sideT > 0) {
        this.sideT -= dt;
        lx += this.side.x * 0.8;
        lz += this.side.z * 0.8;
      }
      const m = Math.hypot(lx, lz);
      if (m > 1) { lx /= m; lz /= m; }
      return { x: lx, z: lz };
    }

    updateThrow(dt) {
      const c = this.c, g = this.g;
      if (this.aim) {
        const t = this.aim.target;
        this.aim.t -= dt;
        const d = Math.hypot(t.x - c.x, t.z - c.z);
        if (d > C.throwRange || t.stunT > 0 || t.fallT > 0 || t.isSafe() || c.glasses <= 0) {
          this.aim = null;
          c.alert.visible = false;
        } else if (this.aim.t <= 0) {
          g.throwGlass(c, t);
          this.aim = null;
          c.alert.visible = false;
        }
        return;
      }
      if (c.glasses <= 0) return;
      this.thinkT -= dt;
      if (this.thinkT > 0) return;
      this.thinkT = 0.25;
      const leader = g.chars.reduce((a, b) => (b.score > a.score ? b : a), g.chars[0]);
      let best = null, bw = 0;
      for (const o of g.chars) {
        if (o === c || o.shieldT > 0 || o.stunT > 0 || o.fallT > 0 || o.isSafe() || o.beers < 1) continue;
        if (Math.hypot(o.x - c.x, o.z - c.z) > C.throwRange * 0.9) continue;
        const w = o.beers + (o.isHuman ? 2 : 0) + (o === leader ? 2 : 0) + Math.random() * 2;
        if (w > bw) { bw = w; best = o; }
      }
      if (best && Math.random() < this.p.aggression * 0.3) {
        this.aim = { target: best, t: rand(this.p.react[0], this.p.react[1]) };
        c.alert.visible = true;
        if (best.isHuman) g.notify(`${c.name} is aiming at you!`, 'warn');
      }
    }
  }
  HMB.BotBrain = BotBrain;
})();
