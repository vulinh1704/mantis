/** Browser-context and page lifecycle helpers used by `look` and `proof --video`. */

/** Accept-Language header for a locale cell: `vi` -> `vi`, `de-DE` -> `de-DE,de;q=0.9`. */
export function acceptLanguage(locale) {
  const base = locale.split('-')[0];
  return base !== locale ? `${locale},${base};q=0.9` : locale;
}

/**
 * Playwright context options for one cell.
 * @param {{viewport: import('./options.js').Viewport, scheme: 'light'|'dark', locale: string, browserLocale?: string}} cell
 *   `browserLocale` is the real locale the browser asks for (the pseudo-locale cell asks for its base language)
 * @param {{cookies: object[], origins: object[]} | null} [storageState]  session to start with (--storage-state)
 */
export function contextOptions(cell, storageState = null) {
  const v = cell.viewport;
  const locale = cell.browserLocale ?? cell.locale;
  return {
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    isMobile: v.isMobile,
    hasTouch: v.hasTouch,
    colorScheme: cell.scheme,
    reducedMotion: 'reduce',
    locale,
    extraHTTPHeaders: { 'Accept-Language': acceptLanguage(locale) },
    bypassCSP: true,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
    ...(storageState ? { storageState } : {}),
  };
}

/**
 * The URL a locale cell opens: the route itself, or with the locale as a path prefix
 * (`path:/{locale}`: `/settings` -> `/vi/settings`) or a query parameter (`query:lang`).
 * @param {URL} baseUrl
 * @param {string} route
 * @param {string} locale
 * @param {import('./options.js').LocaleStrategy} strategy
 */
export function localeUrl(baseUrl, route, locale, strategy) {
  const url = new URL(route, baseUrl);
  if (strategy.kind === 'path') {
    const prefix = strategy.template.replace('{locale}', encodeURIComponent(locale)).replace(/\/+$/, '');
    url.pathname = prefix + url.pathname;
  } else if (strategy.kind === 'query') {
    url.searchParams.set(strategy.name, locale);
  }
  return url.href;
}

/**
 * Give a cell's context the locale before the page loads: a cookie on the app's origin
 * (`cookie:<name>`), or a localStorage entry written before any page script runs (`storage:<key>`).
 * @param {import('playwright').BrowserContext} context
 * @param {string} url
 * @param {string} locale
 * @param {import('./options.js').LocaleStrategy} strategy
 */
export async function applyLocaleStrategy(context, url, locale, strategy) {
  if (strategy.kind === 'cookie') {
    await context.addCookies([{ name: strategy.name, value: locale, url: new URL(url).origin }]);
  } else if (strategy.kind === 'storage') {
    await context.addInitScript(({ key, value }) => {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // storage disabled (opaque origin): nothing to set
      }
    }, { key: strategy.key, value: locale });
  }
}

/**
 * Pseudo-localize every page of a context: from the first parsed node on, and again whenever the
 * app re-renders, each visible string becomes accented, about 40% longer and bracketed
 * ("Settings" -> "[Šééţţţîññĝšš]"), the way real translations grow. The brackets show when the
 * start or the end of a string gets cut. Code, scripts, form fields the user types in and
 * `translate="no"` content are left alone. With `rtl` the page is also laid out right to left
 * (`<html dir="rtl">`, kept even if the app sets it back), as Arabic or Hebrew would be.
 * @param {import('playwright').BrowserContext} context
 * @param {{rtl?: boolean}} [opts]
 */
export async function installPseudoLocale(context, { rtl = false } = {}) {
  await context.addInitScript(({ rtl }) => {
    if (rtl) {
      const setDir = () => {
        const root = document.documentElement;
        if (root && root.getAttribute('dir') !== 'rtl') root.setAttribute('dir', 'rtl');
      };
      setDir();
      new MutationObserver(setDir).observe(document, { childList: true, subtree: false });
      document.addEventListener('DOMContentLoaded', () => {
        setDir();
        new MutationObserver(setDir).observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] });
      });
    }
    const MAP = {
      a: 'á', b: 'ƀ', c: 'ç', d: 'ð', e: 'é', f: 'ƒ', g: 'ĝ', h: 'ĥ', i: 'î', j: 'ĵ', k: 'ķ', l: 'ļ', m: 'ɱ',
      n: 'ñ', o: 'ö', p: 'þ', q: 'ǫ', r: 'ŕ', s: 'š', t: 'ţ', u: 'û', v: 'ṽ', w: 'ŵ', x: 'ẋ', y: 'ý', z: 'ž',
      A: 'Å', B: 'Ɓ', C: 'Ç', D: 'Ð', E: 'É', F: 'Ƒ', G: 'Ĝ', H: 'Ĥ', I: 'Î', J: 'Ĵ', K: 'Ķ', L: 'Ļ', M: 'Ṁ',
      N: 'Ñ', O: 'Ö', P: 'Þ', Q: 'Ǫ', R: 'Ŕ', S: 'Š', T: 'Ţ', U: 'Û', V: 'Ṽ', W: 'Ŵ', X: 'Ẋ', Y: 'Ý', Z: 'Ž',
    };
    const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'KBD', 'SAMP', 'TEMPLATE']);
    const done = new WeakMap(); // text node -> the string we wrote, so our own writes are not redone
    const pseudo = (s) => {
      if (!/[A-Za-z]/.test(s)) return s;
      const lead = s.match(/^\s*/)[0];
      const trail = s.match(/\s*$/)[0];
      const core = s.slice(lead.length, s.length - trail.length);
      const letters = (core.match(/[A-Za-z]/g) || []).length;
      const extra = Math.ceil(letters * 0.4);
      let out = '';
      let i = 0;
      for (const ch of core) {
        const c = MAP[ch] ?? ch;
        out += c;
        if (/[A-Za-z]/.test(ch)) {
          // Spread the extra letters evenly over the string.
          if (Math.floor(((i + 1) * extra) / letters) > Math.floor((i * extra) / letters)) out += c;
          i++;
        }
      }
      return `${lead}[${out}]${trail}`;
    };
    const skipped = (el) => {
      for (let n = el; n; n = n.parentElement) {
        if (SKIP.has(n.tagName) || n.getAttribute?.('translate') === 'no' || n.isContentEditable) return true;
      }
      return false;
    };
    const fixText = (t) => {
      if (done.get(t) === t.data || !t.parentElement || skipped(t.parentElement)) return;
      const next = pseudo(t.data);
      done.set(t, next);
      if (next !== t.data) t.data = next;
    };
    const fixElement = (el) => {
      if (skipped(el)) return;
      if (el.placeholder && !el.dataset.mantisPseudo) {
        el.placeholder = pseudo(el.placeholder);
        el.dataset.mantisPseudo = '1';
      }
      if (el.tagName === 'INPUT' && /^(submit|button|reset)$/i.test(el.type) && el.value && !el.dataset.mantisPseudo) {
        el.value = pseudo(el.value);
        el.dataset.mantisPseudo = '1';
      }
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.nodeType === Node.TEXT_NODE) fixText(n);
        else if (n.placeholder || n.tagName === 'INPUT') fixElement(n);
      }
    };
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === 'characterData') fixText(r.target);
        for (const n of r.addedNodes) {
          if (n.nodeType === Node.TEXT_NODE) fixText(n);
          else if (n.nodeType === Node.ELEMENT_NODE) fixElement(n);
        }
      }
    }).observe(document, { childList: true, subtree: true, characterData: true });
    document.addEventListener('DOMContentLoaded', () => document.body && fixElement(document.body));
  }, { rtl });
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
