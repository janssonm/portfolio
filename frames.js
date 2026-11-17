// Loads the skier's "ink maps" from one image, once, when the page loads.
// assets/skier-frames.png is every frame of the ski clip stacked top to bottom, already turned into ink:
// black is paper (0), white is full ink (1). Making it from the video takes a few seconds, so it is done once,
// ahead of time, with tools/bake-skier-frames.html, instead of on every visit.
//
// An ink map is a Float32Array of width × height numbers from 0 to 1, one per frame.
// sketch.js reads them with inkAt() and draws dots.

async function loadSkierFrames(url, count) {
  const img = new Image();
  await new Promise((loaded, failed) => { img.onload = loaded; img.onerror = failed; img.src = url; });

  // read the pixels; any of red, green or blue holds the ink, since the image is grey
  const width = img.width, height = img.height / count;
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;

  // cut it into one ink map per frame
  const frames = [];
  for (let f = 0; f < count; f++) {
    const d = new Float32Array(width * height);
    for (let i = 0; i < d.length; i++) d[i] = px[(f * width * height + i) * 4] / 255;
    frames.push(d);
  }
  return { frames, width, height };
}
