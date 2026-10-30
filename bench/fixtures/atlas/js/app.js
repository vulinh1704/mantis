// Shared behaviour: filter buttons, cookie notice, invoice table.
document.querySelectorAll('.filters button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
  });
});

const cookie = document.querySelector('.cookie');
if (cookie) {
  if (localStorage.getItem('atlas-cookies') === 'ok') cookie.hidden = true;
  cookie.querySelector('button').addEventListener('click', () => {
    localStorage.setItem('atlas-cookies', 'ok');
    cookie.hidden = true;
  });
}

const tbody = document.querySelector('#invoice-rows');
if (tbody && window.ATLAS_INVOICES) {
  const money = new Intl.NumberFormat(window.ATLAS_LANG === 'vi' ? 'vi-VN' : 'en-US', { style: 'currency', currency: 'USD' });
  tbody.innerHTML = window.ATLAS_INVOICES.map((inv) => `
    <tr>
      <td>${inv.number}</td>
      <td class="customer">${inv.customer}</td>
      <td>${inv.due}</td>
      <td>${money.format(inv.amount)}</td>
      <td><span class="status status--${inv.status}">${window.t('status.' + inv.status)}</span></td>
    </tr>`).join('');
}
