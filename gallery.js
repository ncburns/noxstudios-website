(() => {
  document.querySelectorAll('[data-gallery]').forEach(gallery => {
    const track = gallery.querySelector('[data-gallery-track]');
    const slides = Array.from(gallery.querySelectorAll('[data-slide]'));
    const status = gallery.querySelector('[data-gallery-status]');
    const previous = gallery.querySelector('[data-gallery-prev]');
    const next = gallery.querySelector('[data-gallery-next]');
    const controls = gallery.querySelector('[data-gallery-controls]');
    if (!track || !slides.length) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const position = slide => slide.offsetLeft - slides[0].offsetLeft;
    const limit = () => Math.max(0, track.scrollWidth - track.clientWidth);
    const clamp = value => Math.max(0, Math.min(limit(), value));
    let destination = 0;
    let timer;
    const update = left => {
      const right = left + track.clientWidth;
      const visible = slides.map((slide, index) => ({slide, index})).filter(({slide}) =>
        position(slide) + slide.offsetWidth > left + 1 && position(slide) < right - 1);
      if (visible.length) {
        const first = visible[0].index + 1;
        const last = visible[visible.length - 1].index + 1;
        status.textContent = (first === last ? first : first + '–' + last) + ' / ' + slides.length;
      }
      previous.disabled = left <= 1;
      next.disabled = left >= limit() - 1;
      controls.hidden = limit() <= 1;
    };
    const goTo = left => {
      destination = clamp(left);
      update(destination);
      track.scrollTo({left:destination, behavior:motion.matches ? 'auto' : 'smooth'});
    };
    const step = direction => {
      // Clamp slide positions to the actual content edge, without spacer slides.
      const stops = slides.map(slide => clamp(position(slide)));
      const target = direction > 0
        ? stops.find(left => left > destination + 1)
        : stops.slice().reverse().find(left => left < destination - 1);
      goTo(target === undefined ? (direction > 0 ? limit() : 0) : target);
    };
    previous.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    track.addEventListener('keydown', event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      if (event.key === 'Home') goTo(0);
      else if (event.key === 'End') goTo(limit());
      else step(event.key === 'ArrowRight' ? 1 : -1);
    });
    track.addEventListener('scroll', () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        destination = clamp(track.scrollLeft);
        update(destination);
      }, 120);
    }, {passive:true});
    const resize = () => {
      destination = clamp(track.scrollLeft);
      update(destination);
    };
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(track);
    else window.addEventListener('resize', resize);
    resize();
  });
})();
