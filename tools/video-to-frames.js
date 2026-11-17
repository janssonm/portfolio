// Turns the ski clip into a list of "ink maps". Used by tools/bake-skier-frames.html, which saves them as
// assets/skier-frames.png, so the site itself never has to do this slow step (it takes a few seconds).
// Plain browser JavaScript (video seeking and pixel reading).
//
// An ink map is a Float32Array of width × height numbers from 0 (paper) to 1 (full ink), one per video frame.

async function videoToFrames(url, fps, width) {
  // load the whole clip as a blob, so the video can jump to any time (the local server can't stream ranges)
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto';
  v.src = URL.createObjectURL(await (await fetch(url)).blob());
  await new Promise(ok => v.oncanplaythrough = ok);

  // 1. Grab every frame. The export puts the picture inside a black square and the picture changes size
  //    during the clip, so also note where the picture is in each frame.
  const S = 400, pc = document.createElement('canvas'); pc.width = pc.height = S;
  const pg = pc.getContext('2d', { willReadFrequently: true });
  const shots = [], rects = [];
  for (let t = 0; t < v.duration - .5 / fps; t += 1 / fps) {
    await new Promise(r => { v.onseeked = r; v.currentTime = t; });
    pg.drawImage(v, 0, 0, S, S);
    const d = pg.getImageData(0, 0, S, S).data;
    const col = x => { let m = 0; for (let y = S * .25; y < S * .75; y++) { const i = (y * S + x) * 4; m += d[i] + d[i + 1] + d[i + 2]; } return m / (S * .5 * 765); };
    const row = y => { let m = 0; for (let x = S * .25; x < S * .75; x++) { const i = (y * S + x) * 4; m += d[i] + d[i + 1] + d[i + 2]; } return m / (S * .5 * 765); };
    let l = 0, r = S - 1, tp = 0, bt = S - 1;
    while (l < S / 2 && col(l) < .45) l++; while (r > S / 2 && col(r) < .45) r--;
    while (tp < S / 2 && row(tp) < .45) tp++; while (bt > S / 2 && row(bt) < .45) bt--;
    rects.push([l, tp, r, bt]);
    shots.push(await createImageBitmap(pc));
  }

  // 2. Ink for one frame through a crop [x, y, w, h]: dark suit or bright yellow trim = ink, snow = paper.
  let height = width;
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  const ink = (shot, crop) => {
    g.drawImage(shot, ...crop, 0, 0, width, height);
    const px = g.getImageData(0, 0, width, height).data, d = new Float32Array(width * height);
    for (let i = 0; i < d.length; i++) {
      const r = px[i * 4], gr = px[i * 4 + 1], bl = px[i * 4 + 2];
      const lum = (.3 * r + .59 * gr + .11 * bl) / 255, mx = Math.max(r, gr, bl), mn = Math.min(r, gr, bl);
      let k = Math.max((.86 - lum) / .55, (mx - mn) / (mx + 1) * 1.15 - .15);
      k = Math.min(1, Math.max(0, (k - .22) / .78));                 // snow, tracks and faint shadow drop out
      d[i] = k < .14 ? 0 : .48 + .52 * Math.min(1, (k - .14) * 1.6);  // a solid figure with tone inside
    }
    return d;
  };

  // 3. One fixed crop: the area that is picture in every frame.
  const L = Math.max(...rects.map(r => r[0])), T = Math.max(...rects.map(r => r[1]));
  const R = Math.min(...rects.map(r => r[2])), B = Math.min(...rects.map(r => r[3]));
  const base = [L + 4, T + 4, R - L - 8, B - T - 8];
  height = Math.round(width * base[3] / base[2]);
  c.width = width; c.height = height;

  // 4. The export jumps sideways halfway and at the loop point. Keep the skier's natural sway,
  //    but replace any jump bigger than JUMP by the average of its neighbours, then close the loop.
  const JUMP = 7;
  const xs = shots.map(sh => { const d = ink(sh, base); let sx = 0, n = 0; for (let i = 0; i < d.length; i++) if (d[i] > 0) { sx += i % width; n++; } return base[0] + sx / n / width * base[2]; });
  const n = xs.length;
  const steps = xs.map((x, i) => xs[(i + 1) % n] - x);
  const fixed = steps.map((d, i) => Math.abs(d) > JUMP ? (steps[(i + n - 1) % n] + steps[(i + 1) % n]) / 2 : d);
  const drift = fixed.reduce((a, b) => a + b, 0);
  const path = [xs[0]]; for (let i = 0; i < n - 1; i++) path.push(path[i] + fixed[i] - drift / n);
  const shift = path.map((p, i) => p - xs[i]);
  const pad = Math.ceil(Math.max(...shift.map(Math.abs)));
  height = Math.round(width * base[3] / (base[2] - 2 * pad)); c.height = height;   // narrower, so no black shows
  const frames = shots.map((sh, i) => ink(sh, [base[0] + pad - shift[i], base[1], base[2] - 2 * pad, base[3]]));

  // 5. Remove repeated frames: the held frames at the end, and any frame in the middle that only repeats the one
  //    before it (blending it with its neighbours instead gave a see-through "double" skier, a small glitch).
  const same = (p, q) => { let m = 0; for (let i = 0; i < p.length; i++) m += Math.abs(p[i] - q[i]); return m / p.length < .015; };
  while (frames.length > 2 && same(frames[frames.length - 1], frames[frames.length - 2])) frames.pop();
  if (frames.length > 2 && same(frames[frames.length - 1], frames[frames.length - 3])) frames.pop();
  for (let i = frames.length - 1; i > 0; i--) if (same(frames[i], frames[i - 1])) frames.splice(i, 1);

  return { frames, width, height };
}
