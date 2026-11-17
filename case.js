// The cases below the landing screen.
// Everything with class="reveal" gets the class "in-view" the first time it scrolls into view; style.css holds the
// animation until then. The case video only plays while you can see it.

const revealer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    // in view, or already scrolled past (a fast jump down the page can skip over things)
    if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
      entry.target.classList.add('in-view');
      revealer.unobserve(entry.target);          // only once
    }
  }
}, { rootMargin: '0px 0px -12% 0px' });           // start a little after the top of it enters the screen

document.querySelectorAll('.reveal').forEach((el) => revealer.observe(el));

// Click the video to pause or play it. A video you paused stays paused, even when it scrolls back into view.
for (const video of document.querySelectorAll('.case video')) {
  let pausedByYou = false;
  video.style.cursor = 'pointer';
  video.addEventListener('click', () => {
    pausedByYou = !video.paused;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  });
  new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting && !pausedByYou) video.play().catch(() => {});   // play() can be refused, e.g. in power-saving mode
    else video.pause();
  }).observe(video);
}
