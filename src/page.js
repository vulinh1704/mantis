/** Browser-context and page lifecycle helpers used by `look` and `proof --video`. */

/** Accept-Language header for a locale cell: `vi` -> `vi`, `de-DE` -> `de-DE,de;q=0.9`. */
export function acceptLanguage(locale) {
  const base = locale.split('-')[0];
  return base !== locale ? `${locale},${base};q=0.9` : locale;
}

/**
 * Playwright context options for one cell.
 * @param {{viewport: import('./options.js').Viewport, scheme: 'light'|'dark', locale: string}} cell
 * @param {{cookies: object[], origins: object[]} | null} [storageState]  session to start with (--storage-state)
 */
export function contextOptions(cell, storageState = null) {
  const v = cell.viewport;
  return {
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    isMobile: v.isMobile,
    hasTouch: v.hasTouch,
    colorScheme: cell.scheme,
    reducedMotion: 'reduce',
    locale: cell.locale,
    extraHTTPHeaders: { 'Accept-Language': acceptLanguage(cell.locale) },
    bypassCSP: true,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    ...(storageState ? { storageState } : {}),
  };
}

/** Collect network results and keep an in-flight counter so we can wait for quiet. */
export function trackNetwork(page) {
  const net = { responses: [], failed: [], inflight: 0, lastActivity: Date.now() };
  const isMain = (req) => {
    try {
      return req.isNavigationRequest() && req.frame() === page.mainFrame();
    } catch {
      return false;
    }
  };
  page.on('request', () => {
    net.inflight++;
    net.lastActivity = Date.now();
  });
  page.on('requestfinished', () => {
    net.inflight = Math.max(0, net.inflight - 1);
    net.lastActivity = Date.now();
  });
  page.on('requestfailed', (req) => {
    net.inflight = Math.max(0, net.inflight - 1);
    net.lastActivity = Date.now();
    net.failed.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType(),
      failure: req.failure()?.errorText ?? 'failed',
      isMain: isMain(req),
    });
  });
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const req = res.request();
    net.responses.push({ url: res.url(), status: res.status(), method: req.method(), resourceType: req.resourceType(), isMain: isMain(req) });
  });
  return net;
}

/** Collect uncaught errors and console.error messages. */
export function trackConsole(page) {
  const out = { pageErrors: [], errors: [] };
  page.on('pageerror', (err) => {
    out.pageErrors.push({ name: err.name, message: err.message, stack: err.stack });
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    let location = null;
    try {
      location = msg.location();
    } catch {
      location = null;
    }
    out.errors.push({ text: msg.text(), location });
  });
  return out;
}

export async function waitForQuiet(page, net, { quietMs = 300, timeout = 3000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (net.inflight <= 0 && Date.now() - net.lastActivity >= quietMs) return true;
    await page.waitForTimeout(50);
  }
  return false;
}

export async function fontsReady(page) {
  await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true)).catch(() => {});
}

export async function nextFrames(page) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))).catch(() => {});
}

/** Wait for network idle (capped), web fonts and the optional extra --wait. Returns notes. */
export async function settle(page, { wait = 0, idleTimeout = 8000 } = {}) {
  const notes = [];
  try {
    await page.waitForLoadState('networkidle', { timeout: idleTimeout });
  } catch {
    notes.push(`network did not go idle within ${Math.round(idleTimeout / 1000)}s`);
  }
  await fontsReady(page);
  if (wait > 0) await page.waitForTimeout(wait);
  return notes;
}

/**
 * Apply a class/attribute dark strategy on <html> (the media strategy needs nothing: the
 * context already emulates prefers-color-scheme for every strategy).
 * @param {import('playwright').Page} page
 * @param {import('./options.js').DarkStrategy} strategy
 * @param {'light'|'dark'} scheme
 */
export async function applyDarkStrategy(page, strategy, scheme) {
  if (strategy.kind === 'media') return;
  await page.evaluate(({ strategy, dark }) => {
    const root = document.documentElement;
    if (strategy.kind === 'class') root.classList.toggle(strategy.name, dark);
    else if (dark) root.setAttribute(strategy.name, strategy.value);
    else if (root.getAttribute(strategy.name) === strategy.value) root.removeAttribute(strategy.name);
  }, { strategy, dark: scheme === 'dark' });
  await nextFrames(page);
}

/** Jump finite CSS animations/transitions and WAAPI animations to their end state. */
export async function finishAnimations(page) {
  await page.evaluate(() => {
    for (const a of document.getAnimations()) {
      try {
        const t = a.effect && a.effect.getComputedTiming();
        if (t && Number.isFinite(t.endTime) && a.playState !== 'finished') a.finish();
      } catch {
        // ignore animations that cannot finish
      }
    }
  }).catch(() => {});
}

/**
 * Scroll through the page once so lazy images load and scroll-reveal content appears, then go
 * back to the top. Capped at 40 steps.
 */
export async function prescroll(page) {
  await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const height = () => Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    const step = Math.max(200, Math.floor(innerHeight * 0.85));
    let y = 0;
    for (let i = 0; i < 40 && y < height() - innerHeight; i++) {
      y += step;
      window.scrollTo({ left: 0, top: y, behavior: 'instant' });
      await sleep(40);
    }
    window.scrollTo({ left: 0, top: 0, behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/** Visible text of the page, whitespace-normalised (used to spot untranslated locale cells). */
export async function pageText(page) {
  return page.evaluate(() => (document.body ? document.body.innerText : '').replace(/\s+/g, ' ').trim());
}
