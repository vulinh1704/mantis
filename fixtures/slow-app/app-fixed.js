// Slowpoke's orders page, fixed: one call brings the page's data, nothing waits for anything else.

async function loadPage() {
  const res = await fetch('/api/page');
  return res.json();
}

function showGreeting(user) {
  document.getElementById('greeting').textContent = `Welcome back, ${user.name}.`;
  // The banner's space is kept in the HTML: filling it moves nothing.
  if (window.FLAGS.promo) document.getElementById('promo').textContent = 'Free shipping on your next order';
}

function renderOrders(orders) {
  const list = document.getElementById('orders');
  list.innerHTML = orders.map((o) => `<li>${o.product.name} · ${o.status}</li>`).join('');
}

// Computes the scale once, then draws: linear work.
function renderAllPoints(points) {
  const ctx = document.getElementById('chart').getContext('2d');
  const values = points.map((p, i) => Math.sqrt(p * (i + 1)));
  const max = Math.max(...values);
  for (let i = 0; i < values.length; i++) ctx.fillRect(i % 320, 120 - (values[i] / max) * 120, 1, 1);
}

// The chat widget loads when someone wants to chat (a facade), not with every page.
document.getElementById('chat').addEventListener('click', () => {
  const s = document.createElement('script');
  s.src = window.CHAT_SRC;
  document.head.append(s);
}, { once: true });

async function main() {
  const { config, user, orders } = await loadPage();
  showGreeting(user);
  renderOrders(orders);
  if (window.FLAGS.chart) renderAllPoints(Array.from({ length: config.points }, (_, i) => (i * 7919) % 1000));
}

main();
