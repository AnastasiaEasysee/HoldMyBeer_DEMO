// Hold My Beer — tweakable numbers.
// Everything the spec marks "(can be tweaked)" lives here.
window.HMB = window.HMB || {};

HMB.CONFIG = {
  matchSeconds: 120,
  countdownSeconds: 3,

  // Room (metres). x: left/right, z: distance from the back wall behind the bar.
  room: { minX: -9, maxX: 9, minZ: 0, maxZ: 26 },
  barFrontZ: 1.7,            // front edge of the bar counter
  barReach: 1.4,             // how far from the counter you can still order
  drinkMinBarDistance: 4,    // you must be this far from the counter to drink

  // Getting beers
  maxBeers: 10,
  getBeerCooldown: 1.0,
  serveReach: 1.2,           // distance from a table's edge where Serve appears

  // Drinking
  drinkCooldown: 10,
  drunkSeconds: 5,           // double vision + touchy balance
  drunkWobbleMultiplier: 1.8,
  drunkSensitivityMultiplier: 1.4,
  boostSeconds: 7,
  boostSpeedMultiplier: 1.45,
  drinkShieldSeconds: 7,
  maxGlasses: 3,             // empty glasses you can carry

  // Throwing
  throwRange: 5,
  throwAimConeDeg: 32,       // how close to the centre of view a target must be
  throwSwipePx: 36,          // swipe distance that releases the throw
  stunSeconds: 1,
  beersLostOnHit: 2,
  hitShieldSeconds: 5,

  // Movement and balance
  playerRadius: 0.38,
  walkSpeed: 4.4,            // m/s at full lean, empty tray
  speedLossPerBeer: 0.035,   // each beer slows you a little (min 60%)
  acceleration: 7,
  lookSpeed: 2.4,            // rad/s at full look-stick
  tiltMaxDeg: 24,            // phone tilt for full lean
  tiltDeadzone: 0.07,
  wobbleBase: 0.02,          // tray sway with no beers
  wobblePerBeer: 0.032,      // extra sway per beer
  sensitivityPerBeer: 0.05,  // lean is amplified by each beer
  bounce: 0.55,              // restitution when bumping into things
  bumpImpulse: 1.4,
  knockSeconds: 0.25,        // reduced control right after a bump

  cameraDistance: 4.4,
  cameraHeight: 3.3,

  humanColor: 0x6fcf7b,

  // AI rivals. lean = how hard they push the stick, balance = how well they correct sway,
  // aggression/drinkChance = how often they drink and throw, farBias = love of high-value tables.
  bots: [
    { name: 'PintPaul', shirt: 0xe5533d, pants: 0x2d2a3a, hair: 0x2a1a0e,
      tripMin: 6, tripMax: 10, lean: 0.78, skill: 0.85, balance: 0.55,
      aggression: 0.35, drinkChance: 0.18, farBias: 0.05, random: 0.25, react: [0.8, 1.2] },
    { name: 'AleAlice', shirt: 0x4f8de0, pants: 0x3b3326, hair: 0xd9a441,
      tripMin: 3, tripMax: 6, lean: 0.85, skill: 0.9, balance: 0.7,
      aggression: 0.5, drinkChance: 0.25, farBias: 0.15, random: 0.2, react: [0.7, 1.0] },
    { name: 'StoutSam', shirt: 0xa46be0, pants: 0x1f2a24, hair: 0x101010,
      tripMin: 4, tripMax: 8, lean: 0.8, skill: 0.87, balance: 0.5,
      aggression: 0.9, drinkChance: 0.45, farBias: 0.0, random: 0.3, react: [0.6, 0.9] },
  ],
};
