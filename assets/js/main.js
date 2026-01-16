(() => {
  const toggle = document.querySelector('[data-nav-toggle]');
  const menu = document.querySelector('[data-mobile-menu]');

  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const open = menu.getAttribute('data-open') === '1';
      menu.setAttribute('data-open', open ? '0' : '1');
      menu.style.display = open ? 'none' : 'block';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

    // Close on link click
    menu.querySelectorAll('a[href^="#"]').forEach(a => {
      a.addEventListener('click', () => {
        menu.setAttribute('data-open', '0');
        menu.style.display = 'none';
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Reveal on scroll
  const els = Array.from(document.querySelectorAll('.reveal'));
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('on');
    });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));

  // Contact: mailto composition
  const form = document.querySelector('[data-contact-form]');
  if (form) {
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = form.querySelector('[name="name"]').value.trim();
      const email = form.querySelector('[name="email"]').value.trim();
      const message = form.querySelector('[name="message"]').value.trim();

      const subject = encodeURIComponent(`New inquiry from ${name || 'Website'}`);
      const body = encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\n\n${message}`
      );

      const to = form.getAttribute('data-mailto') || 'hello@noxstudios.com';
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    });
  }
})();
