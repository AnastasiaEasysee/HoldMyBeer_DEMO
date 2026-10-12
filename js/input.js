// Input: on-screen joysticks, phone tilt (gyroscope) and a keyboard fallback for desktop testing.
(function () {
  const C = HMB.CONFIG;

  class Stick {
    constructor(el) {
      this.el = el;
      this.knob = el.querySelector('.knob');
      this.x = 0;
      this.y = 0;
      this.id = null;
      el.addEventListener('pointerdown', (e) => {
        if (this.id !== null) return;
        this.id = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        this.track(e);
        e.preventDefault();
      });
      el.addEventListener('pointermove', (e) => { if (e.pointerId === this.id) this.track(e); });
      const end = (e) => { if (e.pointerId === this.id) this.reset(); };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);
      el.addEventListener('lostpointercapture', end);
    }
    track(e) {
      const r = this.el.getBoundingClientRect();
      const rad = (r.width / 2) * 0.62;
      let dx = (e.clientX - (r.left + r.width / 2)) / rad;
      let dy = (e.clientY - (r.top + r.height / 2)) / rad;
      const m = Math.hypot(dx, dy);
      if (m > 1) { dx /= m; dy /= m; }
      this.x = dx;
      this.y = dy;
      this.knob.style.transform = `translate(${dx * rad}px, ${dy * rad}px)`;
      this.el.classList.add('active');
    }
    reset() {
      this.id = null;
      this.x = this.y = 0;
      this.knob.style.transform = '';
      this.el.classList.remove('active');
    }
  }

  const Input = {
    mode: 'stick',           // 'stick' or 'tilt'
    lookStick: null,
    moveStick: null,
    keys: Object.create(null),
    gyro: { seen: false, beta: 0, gamma: 0, nx: 0, ny: 0 },

    init() {
      this.lookStick = new Stick(document.getElementById('stick-look'));
      this.moveStick = new Stick(document.getElementById('stick-move'));
      addEventListener('keydown', (e) => {
        if (e.target && e.target.tagName === 'INPUT') return;
        this.keys[e.code] = true;
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      });
      addEventListener('keyup', (e) => { this.keys[e.code] = false; });
      addEventListener('blur', () => { this.keys = Object.create(null); });
      addEventListener('deviceorientation', (e) => {
        if (e.beta == null || e.gamma == null) return;
        this.gyro.seen = true;
        this.gyro.beta = e.beta;
        this.gyro.gamma = e.gamma;
        if (this.gyro.pendingCal) this.calibrate();
      });
    },

    // Touch device with an orientation API: worth offering tilt by default.
    tiltLikely() {
      return typeof DeviceOrientationEvent !== 'undefined' &&
        (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
    },

    // iOS asks for permission, and only from inside a tap handler.
    async requestTilt() {
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' &&
            typeof DeviceOrientationEvent.requestPermission === 'function') {
          return (await DeviceOrientationEvent.requestPermission()) === 'granted';
        }
        return typeof DeviceOrientationEvent !== 'undefined';
      } catch (_) {
        return false;
      }
    },

    screenAngle() {
      let a = 0;
      if (screen.orientation && typeof screen.orientation.angle === 'number') a = screen.orientation.angle;
      else if (typeof window.orientation === 'number') a = window.orientation;
      return ((a % 360) + 360) % 360;
    },

    // Tilt in screen terms: x = roll to the right, y = pitch towards you.
    rawTilt() {
      const b = this.gyro.beta, g = this.gyro.gamma;
      switch (this.screenAngle()) {
        case 90: return { x: b, y: -g };
        case 270: return { x: -b, y: g };
        case 180: return { x: -g, y: -b };
        default: return { x: g, y: b };
      }
    },

    // The way you hold the phone when the round starts counts as "level".
    calibrate() {
      // No reading yet: calibrate on the first one that arrives
      this.gyro.pendingCal = !this.gyro.seen;
      if (!this.gyro.seen) return;
      const r = this.rawTilt();
      this.gyro.nx = r.x;
      this.gyro.ny = r.y;
    },

    usingTilt() { return this.mode === 'tilt' && this.gyro.seen; },

    // Lean relative to the camera: right (+) / left (-), forward (+) / back (-). Length <= 1.
    getLean() {
      let right = 0, fwd = 0, dz = 0;
      if (this.usingTilt()) {
        const r = this.rawTilt();
        right = (r.x - this.gyro.nx) / C.tiltMaxDeg;
        fwd = -(r.y - this.gyro.ny) / C.tiltMaxDeg;   // tip the top of the phone away = lean forward
        dz = C.tiltDeadzone;
      } else {
        right = this.moveStick.x;
        fwd = -this.moveStick.y;
        dz = 0.08;
      }
      const k = this.keys;
      if (k.KeyW || k.ArrowUp) fwd += 1;
      if (k.KeyS || k.ArrowDown) fwd -= 1;
      if (k.KeyD) right += 1;
      if (k.KeyA) right -= 1;
      let m = Math.hypot(right, fwd);
      if (m < dz) return { right: 0, forward: 0 };
      const scaled = Math.min(1, (m - dz) / (1 - dz));
      return { right: (right / m) * scaled, forward: (fwd / m) * scaled };
    },

    getLook() {
      let x = this.lookStick.x;
      const k = this.keys;
      if (k.ArrowLeft || k.KeyQ) x -= 1;
      if (k.ArrowRight || k.KeyE) x += 1;
      x = Math.max(-1, Math.min(1, x));
      return Math.abs(x) < 0.08 ? 0 : x;
    },

    releaseAll() {
      this.lookStick.reset();
      this.moveStick.reset();
    },
  };

  HMB.Input = Input;
})();
