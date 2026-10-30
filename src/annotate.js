/**
 * Draw issue markers into the live page right before the screenshot: a 2px outline around the
 * element (red for errors, amber for warnings) with a small numbered label. Everything lives in
 * one absolutely positioned layer appended to <html>, sized to the document and clipped to it,
 * so the overlay never changes the page's scroll size. On a right-to-left page the document
 * extends left of x = 0 (overflow goes left), so the layer starts there and rects are shifted.
 *
 * @param {import('playwright').Page} page
 * @param {{n: number, severity: 'error'|'warn', rect: {x: number, y: number, width: number, height: number}}[]} items
 */
export async function annotate(page, items) {
  if (!items.length) return;
  await page.evaluate((items) => {
    for (const n of document.querySelectorAll('[data-mantis-overlay-root]')) n.remove();
    const html = document.documentElement;
    const body = document.body;
    const W = Math.max(html.scrollWidth, body ? body.scrollWidth : 0);
    const H = Math.max(html.scrollHeight, body ? body.scrollHeight : 0);
    const rtl = getComputedStyle(body || html).direction === 'rtl';
    const left = rtl ? Math.min(0, html.clientWidth - W) : 0; // document x of the layer's left edge
    const root = document.createElement('div');
    root.setAttribute('data-mantis-overlay', '');
    root.setAttribute('data-mantis-overlay-root', '');
    root.setAttribute('aria-hidden', 'true');
    root.style.cssText = `all:initial;position:absolute;left:${left}px;top:0;width:${W}px;height:${H}px;overflow:hidden;pointer-events:none;z-index:2147483647;`;
    const placed = [];
    // Larger boxes first so small ones (and their labels) end up on top.
    const sorted = items.slice().sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height);
    for (const it of sorted) {
      const color = it.severity === 'error' ? '#ff2d55' : '#ffb020';
      const ink = it.severity === 'error' ? '#ffffff' : '#1d1d1f';
      let { x, y, width, height } = it.rect;
      x -= left;
      if (width < 10) {
        x -= (10 - width) / 2;
        width = 10;
      }
      if (height < 10) {
        y -= (10 - height) / 2;
        height = 10;
      }
      x = Math.max(0, Math.min(x, W - 6));
      y = Math.max(0, Math.min(y, H - 6));
      width = Math.max(6, Math.min(width, W - x));
      height = Math.max(6, Math.min(height, H - y));
      const box = document.createElement('div');
      box.style.cssText = `all:initial;position:absolute;box-sizing:border-box;left:${x}px;top:${y}px;width:${width}px;height:${height}px;border:2px solid ${color};border-radius:3px;box-shadow:0 0 0 1px rgba(255,255,255,.9),inset 0 0 0 1px rgba(255,255,255,.6);`;
      root.appendChild(box);
      const text = String(it.n);
      const lw = 12 + 7 * text.length;
      let lx = x - 1;
      let ly = y - 18;
      if (ly < 0) ly = y + 3;
      for (let guard = 0; guard < 50 && placed.some((p) => lx < p.x + p.w + 2 && lx + lw > p.x - 2 && Math.abs(p.y - ly) < 17); guard++) lx += lw + 3;
      if (lx + lw > W) lx = Math.max(0, W - lw - 1);
      placed.push({ x: lx, y: ly, w: lw });
      const label = document.createElement('div');
      label.textContent = text;
      label.style.cssText = `all:initial;position:absolute;left:${lx}px;top:${ly}px;min-width:${lw}px;height:16px;box-sizing:border-box;padding:0 4px;background:${color};color:${ink};font:700 11px/16px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;text-align:center;border-radius:4px;box-shadow:0 1px 3px rgba(0,0,0,.4);`;
      root.appendChild(label);
    }
    html.appendChild(root);
  }, items);
}
