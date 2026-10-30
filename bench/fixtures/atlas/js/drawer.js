// Mobile navigation drawer.
if (window.matchMedia('(max-width: 640px)').matches) {
  const toggle = document.querySelector('#drawer-toggle');
  toggle.addEventListener('click', () => {
    const open = document.body.classList.toggle('drawer-open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}
