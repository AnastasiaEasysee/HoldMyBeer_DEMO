# Hold My Beer — phone view demo

A playable single-player demo of the phone/client view from the *Hold My Beer* spec (24/09/2026).
The other players are three AI rivals (PintPaul, AleAlice, StoutSam) that follow the same rules as you.

## Run it

No build step. Three.js loads from a CDN, so you need an internet connection.

- **Quickest:** double-click `index.html`. On a computer it shows the game in a phone-shaped frame.
- **Local server** (any of these, from this folder):
  `npx serve .` or `python -m http.server 8000`

### Play it on your phone (GitHub Pages)

Phones only allow tilt controls on **HTTPS** pages. GitHub Pages gives you a free HTTPS link.

**1. Put the files on GitHub** (pick one):

- **GitHub Desktop:** *File → Add local repository…* → choose this folder → **Publish repository**.
  Untick *Keep this code private* (free GitHub Pages needs a public repo).
- **github.com only:** create a new **public** repository (no README). Click *uploading an existing file*, drag in
  **everything inside this folder** (`index.html`, `README.md`, `.nojekyll`, and the `css` and `js` folders), then **Commit changes**.
- **Command line:** create an empty public repo on github.com, then:
  ```
  git remote add origin https://github.com/<your-username>/<repo-name>.git
  git push -u origin main
  ```

**2. Turn on Pages:** in the repo go to *Settings → Pages*. Under *Build and deployment* choose
*Source: Deploy from a branch*, *Branch: main*, folder */ (root)*, then **Save**.

**3. Open it:** after a minute or two the link appears at the top of that page:
`https://<your-username>.github.io/<repo-name>/`. Open it on your phone. On Android you can use
*Add to Home screen* to get an icon.

After you change something, upload or push again; Pages updates within a minute or two.

On iPhone, the game asks for motion permission when you tap **I understand**. Allow it, or tilt won't work.
On Android, the game goes fullscreen and keeps the screen awake while you play.

The angle you hold the phone at when the countdown says **GO!** counts as level. Double-tap the small level
(bottom centre) to recalibrate mid-round.

If you'd rather not use GitHub, any HTTPS host works, or a local server plus a tunnel:
`npx serve .` then `npx localtunnel --port 3000`.

## Controls

The camera looks down on the room from a fixed angle, with the bar at the top of the screen. Up on the
screen (or tilting the phone away from you) walks towards the bar.

| | Phone | Keyboard (testing) |
|---|---|---|
| Walk / balance | Tilt the phone, or the joystick (bottom-right) | `W A S D` or arrow keys |
| Action (Get Beer / Serve / Drink) | Big coaster button | `Space` |
| Throw a glass | Walk towards a rival so they're in the fan in front of you, hold **Throw**, swipe up. Let go to cancel | Hold `F`, then `Space` |

## What's in the demo

| Spec section | Implemented |
|---|---|
| Map | Fixed 26 × 36 m bar: counter along the top wall, 10 tables worth 1–5 points per beer (further = more), floating point badges |
| Points | Serve all the beers on your tray at a table: beers × table points. Most points when the timer ends wins |
| User controls | Gyro lean with joystick fallback; lean further to walk faster; full trays walk slower |
| Obstacles | Stools and customers at fixed spots, customers walking set routes, other players. Bumping into anything bounces you off hard |
| Hazards | Sticky spills (slow you to 40%) and open cellar hatches (fall in, lose your whole tray, climb out after 1.4 s) |
| Getting beers | **Get Beer** near the bar, 1 s cooldown, max 10. More beers = more tray sway and touchier balance |
| Drinking | **Drink** away from the bar, 10 s cooldown. 5 s double vision + touchier balance; 7 s speed boost; 7 s shield (bubble); +1 empty glass |
| Throwing | Your facing direction aims: the fan shows reach (5 m) and angle; the rival inside it is highlighted. Hit = 1 s stun, −2 beers, 5 s throw immunity |
| Views (phone) | Top-down camera following you, name tags, tutorial → "I understand" → countdown, HUD (beers top-left, score top-middle, filling timer top-right), results with rank and score |
| Sound | Effects for bounces, losing beers, getting a beer, throwing, drinking, falling (synthesised, no files). No music, since the spec puts music on the desktop only |

Not included: the desktop/server view, real multiplayer, and the "Ideas" section.

### How balance works

The tray sways by itself and **drags you off course on top of your own steering**, so leaning harder doesn't cancel it.

- The sway grows with every beer, and it's much stronger while you walk than while you stand still.
- Stopping or turning hard makes the beers slosh and pull you onwards. Bumps send the tray swinging.
- Drinking almost doubles the sway for 5 s.
- The level at the bottom centre shows which way the tray is pulling you. Steer against it.

### Other interpretation choices

- **Serving is a button** (it appears when you're next to a table) so you can walk past cheap tables on the way to far ones.
- **Beers and speed:** each beer makes you slightly slower (`speedLossPerBeer`) and amplifies your lean (`sensitivityPerBeer`).
- A rival about to throw at you shows a red **!** above their head.

## Tweaking

Every number the spec marks "(can be tweaked)" is in [`js/config.js`](js/config.js): match length, cooldowns,
max beers, effect durations, throw range, stun, beers dropped, walk speed, tilt sensitivity, sway, bump strength,
hazards, camera, and the personality of each AI rival. The map layout (tables, obstacles, spills, hatches,
walking routes) is at the top of [`js/world.js`](js/world.js).

## Files

```
index.html        page + HUD markup
css/style.css     phone UI
js/config.js      all tunable numbers
js/world.js       fixed map, obstacles, bar decor
js/character.js   player model + shared movement/balance rules
js/ai.js          pathfinding grid + AI rival brains
js/input.js       joysticks, gyro, keyboard
js/audio.js       synthesised sound effects
js/ui.js          tutorial, HUD, results
js/game.js        game loop, actions, collisions, effects, camera
```
