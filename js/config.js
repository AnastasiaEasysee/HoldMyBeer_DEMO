// Hold My Beer — tweakable numbers.
// Everything the spec marks "(can be tweaked)" lives here.
window.HMB = window.HMB || {};

HMB.CONFIG = {
  matchSeconds: 120,
  countdownSeconds: 3,

  // Room (metres). x: left/right, z: distance from the back wall behind the bar.
  room: { minX: -13, maxX: 13, minZ: 0, maxZ: 36 },
  barFrontZ: 1.7,            // front edge of the bar counter
  barReach: 1.4,             // how far from the counter you can still order
  drinkMinBarDistance: 4,    // you must be this far from the counter to drink

  // Getting beers
  maxBeers: 10,
  getBeerCooldown: 1.0,
  serveReach: 1.2,           // distance from a table's edge where Serve appears
  tableCooldownEnabled: false, // after someone serves a table, nobody can serve it again for a while
  tableCooldownSeconds: 3,

  // Drinking
  drinkCooldown: 10,
  drunkSeconds: 5,           // double vision + touchy balance
  drunkWobbleMultiplier: 1.8,
  drunkSensitivityMultiplier: 1.4,
  boostSeconds: 7,
  boostSpeedMultiplier: 1.45,
  drinkShieldSeconds: 7,
  maxGlasses: 3,             // empty glasses you can carry

  // Throwing: face the rival you want to hit
  throwRange: 5,
  throwAimConeDeg: 40,       // how far off your facing direction a target may be
  stunSeconds: 1,
  beersLostOnHit: 2,
  hitShieldSeconds: 5,
  barSafeDistance: 3.5,      // nobody can hit you this close to the bar counter
  hitPointsPerBeer: 2,       // a hit scores this many points per beer the target was carrying

  // Movement
  playerRadius: 0.38,
  walkSpeed: 4.4,            // m/s at full lean, empty tray
  speedLossPerBeer: 0.035,   // each beer slows you a little (min 60%)
  acceleration: 7,
  tiltMaxDeg: 24,            // phone tilt for full lean
  tiltDeadzone: 0.07,
  sensitivityPerBeer: 0.05,  // lean is amplified by each beer

  // Balance: the tray sways and drags you off course on top of your own steering.
  wobbleBase: 0.02,          // sway with an empty tray
  wobblePerBeer: 0.05,       // extra sway per beer
  wobbleStanding: 0.35,      // share of the sway you feel while standing still
  wobbleMoving: 1.3,         // extra sway at full walking speed
  swayDrift: 2.6,            // m/s of drift at full sway
  sloshCoupling: 0.12,       // stopping or turning hard makes the beers slosh
  sloshDecay: 1.5,

  // Bumping into things
  bounce: 0.9,               // restitution
  bumpImpulse: 3.2,          // extra push away from what you hit
  knockSeconds: 0.45,        // reduced control right after a bump
  bumpStagger: 0.18,         // how much a bump sets your tray swaying

  // Hazards
  stickySpeed: 0.4,          // speed multiplier on sticky spills
  holeFallSeconds: 1.4,      // time spent climbing out of a cellar hatch
  pushPointsPerBeer: 2,      // bump someone into a hatch: points per beer they lose
  pushCreditSeconds: 2.5,    // how long after a bump a fall still counts as your push
  walkerSpeed: 1.3,          // customers walking around

  // Top-down camera, bar at the top of the screen
  cameraHeight: 13,
  cameraBack: 3.5,

  humanColor: 0x6fcf7b,

  // AI rivals. lean = how hard they push the stick, balance = how well they correct sway,
  // aggression/drinkChance = how often they drink and throw, farBias = love of high-value tables.
  bots: [
    { name: 'PintPaul', shirt: 0xe5533d, pants: 0x2d2a3a, hair: 0x2a1a0e,
      tripMin: 6, tripMax: 10, lean: 0.8, skill: 0.88, balance: 0.45,
      aggression: 0.35, drinkChance: 0.18, farBias: 0.05, random: 0.25, react: [0.8, 1.2] },
    { name: 'AleAlice', shirt: 0x4f8de0, pants: 0x3b3326, hair: 0xd9a441,
      tripMin: 3, tripMax: 6, lean: 0.88, skill: 0.92, balance: 0.6,
      aggression: 0.5, drinkChance: 0.25, farBias: 0.15, random: 0.2, react: [0.7, 1.0] },
    { name: 'StoutSam', shirt: 0xa46be0, pants: 0x1f2a24, hair: 0x101010,
      tripMin: 4, tripMax: 8, lean: 0.82, skill: 0.9, balance: 0.4,
      aggression: 0.9, drinkChance: 0.45, farBias: 0.0, random: 0.3, react: [0.6, 0.9] },
  ],
};

// Factory values, used by "Reset to defaults"
HMB.DEFAULTS = JSON.parse(JSON.stringify(HMB.CONFIG));

// Values you can change on the start screen: [config key, label, min, max, step] for numbers,
// [config key, label] for on/off switches (when the default is true/false).
HMB.SETTINGS = [
  { group: 'Round', items: [
    ['matchSeconds', 'Round length (s)', 30, 600, 10],
  ] },
  { group: 'Tables', items: [
    ['tableCooldownEnabled', 'Table cooldown after serving'],
    ['tableCooldownSeconds', 'Table cooldown (s)', 0.5, 30, 0.5],
  ] },
  { group: 'Getting beers', items: [
    ['maxBeers', 'Max beers on the tray', 1, 30, 1],
    ['getBeerCooldown', 'Seconds per beer at the bar', 0.1, 5, 0.1],
  ] },
  { group: 'Drinking', items: [
    ['drinkCooldown', 'Drink cooldown (s)', 0, 60, 1],
    ['drunkSeconds', 'Negative effects: double vision (s)', 0, 30, 0.5],
    ['drunkWobbleMultiplier', 'Negative effects: extra sway (×)', 1, 5, 0.1],
    ['boostSeconds', 'Positive effects: speed boost (s)', 0, 30, 0.5],
    ['boostSpeedMultiplier', 'Positive effects: boost speed (×)', 1, 3, 0.05],
    ['drinkShieldSeconds', 'Positive effects: shield (s)', 0, 30, 0.5],
    ['maxGlasses', 'Max empty glasses carried', 1, 10, 1],
  ] },
  { group: 'Throwing', items: [
    ['throwRange', 'Throw range (m)', 1, 15, 0.5],
    ['throwAimConeDeg', 'Aim fan width (° each side)', 10, 90, 1],
    ['stunSeconds', 'Stun when hit (s)', 0, 5, 0.1],
    ['hitPointsPerBeer', 'Points per beer the target carried', 0, 10, 0.5],
    ['beersLostOnHit', 'Beers dropped when hit', 0, 10, 1],
    ['hitShieldSeconds', 'Immunity after being hit (s)', 0, 20, 0.5],
    ['barSafeDistance', 'Safe zone in front of the bar (m)', 0, 10, 0.5],
  ] },
  { group: 'Walking and balance', items: [
    ['walkSpeed', 'Walk speed (m/s)', 1, 10, 0.1],
    ['speedLossPerBeer', 'Slowdown per beer (fraction)', 0, 0.1, 0.005],
    ['tiltMaxDeg', 'Phone tilt for full speed (°)', 5, 60, 1],
    ['wobblePerBeer', 'Sway per beer', 0, 0.2, 0.005],
    ['wobbleMoving', 'Extra sway while walking', 0, 5, 0.1],
    ['swayDrift', 'Sway drift strength (m/s)', 0, 8, 0.1],
    ['sloshCoupling', 'Slosh when stopping', 0, 0.5, 0.01],
  ] },
  { group: 'Bumping', items: [
    ['bounce', 'Bounciness', 0, 1.5, 0.05],
    ['bumpImpulse', 'Bump push (m/s)', 0, 10, 0.1],
    ['knockSeconds', 'Control loss after a bump (s)', 0, 2, 0.05],
  ] },
  { group: 'Hazards', items: [
    ['stickySpeed', 'Speed on sticky floor (×)', 0.1, 1, 0.05],
    ['holeFallSeconds', 'Time stuck in a cellar hatch (s)', 0.2, 10, 0.1],
    ['pushPointsPerBeer', 'Push into a hatch: points per beer lost', 0, 10, 0.5],
    ['pushCreditSeconds', 'Push still counts for (s)', 0.5, 10, 0.5],
    ['walkerSpeed', 'Walking customer speed (m/s)', 0, 4, 0.1],
  ] },
];
