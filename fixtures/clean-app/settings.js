/* Lumen fixture: settings page behaviour (clean version). */
(function () {
  const form = document.getElementById('settings-form');
  const save = document.querySelector('#save-settings'); // fixed: the button is #save-settings
  if (!form || !save) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save.textContent = window.t('set.saved');
    setTimeout(() => {
      save.textContent = window.t('set.save');
    }, 1500);
  });
})();
