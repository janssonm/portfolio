// The six dithered skiers, drawn with p5.js.
//
// p5 in "instance mode": skier() returns a small sketch, and we start six of them, one per canvas.
// (Global mode, with plain setup() and draw(), only allows one canvas per page.)
// Inside a sketch every p5 function hangs off `p`: p.circle(), p.random(), p.noise(), p.width, ...

// ---------- settings to play with ----------
const DOT_COLOUR = '#111';   // the page colours are in style.css
//const DOT_COLOUR = '#3f41d1'; 
const FPS = 24;                 // frames per second (the frames in assets/skier-frames.png are 1/24 s apart)
const SPEED = 0.7;              // 1 = real time
const FRAME_COUNT = 21;         // frames in assets/skier-frames.png (tools/bake-skier-frames.html tells you)
const STYLE_ORDER = ['halftone', 'stipple', 'coarse', 'sparse', 'goo', 'fine'];  // left→right, top→bottom
const PAIR = [0, 1, 2, 1, 2, 0];                                                 // start time per skier: 1&6, 2&4, 3&5

let FRAMES = [], W = 160, H = 160;   // filled in by loadSkierFrames(); dot positions below are in these units
const START = performance.now(), OFFSET = Math.random();

// ---------- pause and play ----------
// Click the skiers to pause or play all six. The shared clock stops while they are paused, so they carry on from
// the same frame, still in step. People who ask for less motion get them paused from the start (click to play).
const sketches = [];
let pausedAt = matchMedia('(prefers-reduced-motion: reduce)').matches ? START : null, pausedFor = 0;
const clock = () => (pausedAt ?? performance.now()) - START - pausedFor;   // ms of playing time
function togglePause() {
  if (pausedAt === null) { pausedAt = performance.now(); sketches.forEach((sk) => sk.noLoop()); }
  else { pausedFor += performance.now() - pausedAt; pausedAt = null; sketches.forEach((sk) => sk.loop()); }
}

// ---------- reading the ink maps ----------
// how much ink at a point (0 paper … 1 ink), in map units
function inkAt(d, x, y) {
  const i = Math.round(x), j = Math.round(y);
  return i < 0 || j < 0 || i >= W || j >= H ? 0 : d[j * W + i];
}
// the same, averaged over a small square, so dots near an edge shrink smoothly
function inkAround(d, x, y, r) {
  return (inkAt(d, x, y) * 2 + inkAt(d, x - r, y - r) + inkAt(d, x + r, y - r) + inkAt(d, x - r, y + r) + inkAt(d, x + r, y + r)) / 6;
}

// ---------- the six dot styles ----------
// Each gets the sketch p, one ink map d, the scale s (map units → canvas px) and the frame number f.
// p.circle(x, y, diameter) draws one dot; fill and stroke are set once in setup().
const STYLES = {
  // a regular grid; bigger dots where there is more ink
  halftone(p, d, s) {
    const step = 4.2;
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
      const v = inkAround(d, x, y, 1.4);
      if (v > .06) p.circle(x * s, y * s, 2 * Math.sqrt(v) * step * .58 * s);
    }
  },
  // random points, kept with a chance equal to the ink; randomSeed(f) gives the same pattern for a frame
  stipple(p, d, s, f) {
    p.randomSeed(f);
    for (let i = 0; i < 5200; i++) {
      const x = p.random(W), y = p.random(H);
      if (p.random() < inkAt(d, x, y) * .9) p.circle(x * s, y * s, 1.5 * s);
    }
  },
  // a looser grid: each dot nudged a little (fixed per dot), and Perlin noise makes some dots shrink over time
  coarse(p, d, s, f) {
    const step = 5.4;
    p.randomSeed(1);
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
      const jx = p.random(-.8, .8), jy = p.random(-.8, .8);
      const v = inkAround(d, x, y, 1.8);
      if (v <= .1) continue;
      const flicker = p.noise(x * .5, y * .5, f * .15) < .7 ? 1 : .6;
      p.circle((x + jx) * s, (y + jy) * s, 2 * (.25 + .45 * v) * step * s * flicker);
    }
  },
  // a wide grid of big dots
  sparse(p, d, s) {
    const step = 7.5;
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
      const v = inkAround(d, x, y, 2.5);
      if (v > .14) p.circle(x * s, y * s, 2 * (.18 + .4 * v) * step * s);
    }
  },
  // big dots; the melting comes from the "goo" SVG filter on this canvas (see index.html)
  goo(p, d, s) {
    const step = 5;
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) {
      const v = inkAround(d, x, y, 1.8);
      if (v > .12) p.circle(x * s, y * s, 2 * (.26 + .44 * v) * step * s);
    }
  },
  // a fine grid turned 45°, like a printing screen
  fine(p, d, s) {
    const step = 3.4, ca = p.cos(p.QUARTER_PI), sa = p.sin(p.QUARTER_PI);
    for (let v = -90; v < 90; v++) for (let u = -90; u < 90; u++) {
      const x = W / 2 + (u * ca - v * sa) * step, y = H / 2 + (u * sa + v * ca) * step;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const w = inkAround(d, x, y, 1);
      if (w > .08) p.circle(x * s, y * s, 2 * Math.sqrt(w) * step * .6 * s);
    }
  },
};

// ---------- one sketch ----------
// canvas size, with the clip's proportions: as big as fits in the .grid box (style.css makes it 38% of the window
// tall), and narrow enough to leave room for the name and degree beside it (with at least MIN_SPACE around each).
// 3 columns × 2 rows (2 × 3 on phones), minus the gaps.
const MIN_SPACE = 48;
function cellSize() {
  const grid = document.querySelector('.grid'), css = getComputedStyle(grid), stage = grid.parentElement;
  const cols = innerWidth <= 700 ? 2 : 3, rows = 6 / cols;
  const beside = getComputedStyle(stage).flexDirection === 'row';   // titles next to the skiers, not above/below
  const titles = beside ? [...stage.querySelectorAll('.title')].reduce((w, t) => w + t.offsetWidth, 0) : 0;
  const room = stage.clientWidth - titles - (beside ? 4 : 2) * MIN_SPACE;
  const maxH = (grid.clientHeight - (rows - 1) * parseFloat(css.rowGap)) / rows;
  const maxW = (room - (cols - 1) * parseFloat(css.columnGap)) / cols;
  const h = Math.max(40, Math.min(maxH, maxW * H / W));
  return [Math.round(h * W / H), Math.round(h)];
}

function skier(styleName, pair) {
  return (p) => {
    let s = 1;                                    // map units → canvas pixels

    p.setup = () => {
      const canvas = p.createCanvas(...cellSize());
      if (styleName === 'goo') canvas.elt.classList.add('goo');
      p.frameRate(FPS);
      p.noStroke();
      p.fill(DOT_COLOUR);
      s = p.width / W;
      if (pausedAt !== null) p.noLoop();         // paused from the start: show one still frame
      // the last of the six to get its canvas starts the load-in animation
      if (document.querySelectorAll('.grid canvas').length === STYLE_ORDER.length) startAnimation();
    };

    p.draw = () => {
      p.clear();                                  // transparent, so the paper shows through
      // one shared clock for all six, so paired skiers stay on exactly the same frame
      const loops = clock() / 1000 * FPS * SPEED / FRAMES.length;
      const f = Math.floor(((loops + OFFSET + pair / 3) % 1) * FRAMES.length);
      STYLES[styleName](p, FRAMES[f], s, f);
    };

    p.windowResized = () => {
      p.resizeCanvas(...cellSize());
      s = p.width / W;
    };
  };
}

// ---------- start ----------
// "ready" on <body> starts the load-in animation in style.css. It waits until all six skiers have their canvas,
// so text and skiers come in together. If the skiers can't load at all, the text comes in anyway.
const startAnimation = () => document.body.classList.add('ready');

loadSkierFrames('assets/skier-frames.png', FRAME_COUNT).then(({ frames, width, height }) => {
  FRAMES = frames; W = width; H = height;
  const grid = document.querySelector('.grid');
  STYLE_ORDER.forEach((style, i) => sketches.push(new p5(skier(style, PAIR[i]), grid)));
  grid.addEventListener('click', togglePause);
}).catch(startAnimation);
setTimeout(startAnimation, 4000);   // and never keep the text waiting more than 4 seconds
