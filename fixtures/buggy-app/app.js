/* Lumen fixture: landing page behaviour (buggy version). */
(function () {
  // PLANTED(late-hero-shift): "lazy" hero image without width/height. It is requested only after
  // the page has painted, so when it arrives it pushes the headline, the CTAs and everything
  // below it down the page.
  const art = document.getElementById('hero-art');
  const lazyLoad = () => {
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
      art.src = art.dataset.src;
    }, 120)));
  };
  if (art && art.dataset.src) {
    if (document.readyState === 'complete') lazyLoad();
    else window.addEventListener('load', lazyLoad);
  }

  const toggle = document.getElementById('menu-toggle');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      document.body.classList.toggle('menu-open', !open);
    });
  }

  const form = document.querySelector('.newsletter-form');
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      let status = form.parentElement.querySelector('.form-status');
      if (!status) {
        status = document.createElement('p');
        status.className = 'form-status';
        form.after(status);
      }
      status.textContent = window.t('news.thanks');
    });
  }
})();
