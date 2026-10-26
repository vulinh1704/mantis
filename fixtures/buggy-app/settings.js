/* Lumen fixture: settings page behaviour (buggy version). */
(function () {
  const form = document.getElementById('settings-form');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  // PLANTED(settings-js-error): the button was renamed to #save-settings in the redesign and this
  // line was never updated -> "TypeError: Cannot read properties of null" on every load.
  const save = document.querySelector('#save-btn');
  save.addEventListener('click', () => {
    save.textContent = window.t('set.saved');
  });
})();
