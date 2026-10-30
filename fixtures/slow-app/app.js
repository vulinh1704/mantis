// Slowpoke's orders page. Every performance problem here is planted (see PLANTED.json).

async function loadConfig() {
  const res = await fetch('/api/config');
  return res.json();
}

async function loadUser() {
  const res = await fetch('/api/user');
  return res.json();
}

// Waits for the user, although the server knows who is asking: a request chain.
async function loadOrders(user) {
  const res = await fetch(`/api/orders?user=${user.id}`);
  return res.json();
}

// One request per order: N+1.
async function loadProducts(orders) {
  return Promise.all(orders.map(async (o) => (await fetch(`/api/products/${o.product}`)).json()));
}

function showGreeting(user) {
  document.getElementById('greeting').textContent = `Welcome back, ${user.name}.`;
  if (window.FLAGS.promo) {
    // Inserted above everything once the user is known: the page jumps down.
    const promo = document.createElement('div');
    promo.className = 'promo';
    promo.textContent = 'Free shipping on your next order';
    document.body.prepend(promo);
  }
}

function renderOrders(orders, products) {
  const list = document.getElementById('orders');
  list.innerHTML = orders.map((o, i) => `<li>${products[i].name} · ${o.status}</li>`).join('');
}

// Rescales the chart for every point it draws: quadratic work on the main thread.
function renderAllPoints(points) {
  const ctx = document.getElementById('chart').getContext('2d');
  for (let i = 0; i < points.length; i++) {
    let max = 0;
    for (let j = 0; j < points.length; j++) max = Math.max(max, Math.sqrt(points[j] * (j + 1)));
    ctx.fillRect(i % 320, 120 - (Math.sqrt(points[i] * (i + 1)) / max) * 120, 1, 1);
  }
}

async function main() {
  const [, user] = await Promise.all([loadConfig(), loadUser()]);
  showGreeting(user);
  const orders = await loadOrders(user);
  renderOrders(orders, await loadProducts(orders));
  const config = await loadConfig(); // fetched a second time
  if (window.FLAGS.chart) renderAllPoints(Array.from({ length: config.points }, (_, i) => (i * 7919) % 1000));
}

main();
