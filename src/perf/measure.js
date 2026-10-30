/**
 * One cold, throttled visit of a URL with everything `mantis perf` needs to explain it:
 * - metrics (TTFB, FCP, LCP, CLS, TBT, DOMContentLoaded, load) from the page's own Performance APIs;
 * - the LCP element, layout-shift sources, long tasks, and long animation frames with the scripts
 *   and functions that ran in them;
 * - every request from CDP (type, initiator stack, timing, sizes, headers), marked render-blocking
 *   from Resource Timing;
 * - images (natural vs rendered size), the page inventory (text, images, headings, controls) and
 *   the framework / dev-server signs.
 *
 * Throttling is DevTools-style: CPU slowed down by CDP, network shaped per request. Coverage, the
 * server's real wait per request and the CPU profile come from a separate, unthrottled visit
 * (measureTrace).
 */
import { installMantisLib } from '../inpage/lib.js';

/** Lighthouse's mobile and desktop presets (the network values are the ones DevTools throttling applies). */
export const PERF_PROFILES = Object.freeze({
  mobile: {
    name: 'mobile',
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
    hasTouch: true,
    cpuSlowdown: 4,
    network: { latency: 562.5, downloadThroughput: (1474.56 * 1024) / 8, uploadThroughput: (675 * 1024) / 8 },
    label: 'mobile (4× slower CPU, slow 4G)',
  },
  desktop: {
    name: 'desktop',
    viewport: { width: 1350, height: 940 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    cpuSlowdown: 1,
    network: null,
    label: 'desktop (no throttling)',
  },
});

/** Runs in the page before any of its scripts: keeps every performance entry Mantis needs. */
function perfInitScript() {
  const P = { lcp: [], shifts: [], longtasks: [], loafs: [], fcp: null, added: [], loaded: [], fontsDone: [] };
  window.__mantisPerf = P;
  // What could have caused a layout shift: elements inserted after parsing, images and fonts arriving.
  let parsed = false;
  document.addEventListener('DOMContentLoaded', () => (parsed = true));
  new MutationObserver((records) => {
    if (!parsed) return;
    const t = performance.now();
    for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && P.added.length < 1000) P.added.push({ t, node: n });
  }).observe(document, { childList: true, subtree: true });
  document.addEventListener('load', (e) => {
    if (e.target.localName === 'img' && P.loaded.length < 500) P.loaded.push({ t: performance.now(), node: e.target });
  }, true);
  document.fonts?.addEventListener?.('loadingdone', () => P.fontsDone.push(performance.now()));
  // Observers deliver their entries in a later task, which a busy machine can delay past the moment
  // Mantis reads them: P.flush() takes what is still queued (takeRecords) before reading.
  const observers = [];
  P.flush = () => observers.forEach(({ po, fn }) => po.takeRecords().forEach(fn));
  const observe = (type, fn) => {
    try {
      const po = new PerformanceObserver((list) => list.getEntries().forEach(fn));
      po.observe({ type, buffered: true });
      observers.push({ po, fn });
    } catch {
      // entry type not supported by this browser
    }
  };
  observe('paint', (e) => {
    if (e.name === 'first-contentful-paint') P.fcp = e.startTime;
  });
  observe('largest-contentful-paint', (e) => {
    P.lcp.push({ t: e.renderTime || e.loadTime || e.startTime, size: e.size, url: e.url || null, element: e.element || null });
  });
  observe('layout-shift', (e) => {
    if (e.hadRecentInput) return;
    const sources = e.sources || [];
    // How far the content moved down: what pushed it is usually about that tall.
    const dy = Math.max(0, ...sources.map((s) => s.currentRect.y - s.previousRect.y));
    P.shifts.push({ t: e.startTime, value: e.value, nodes: sources.map((s) => s.node).filter(Boolean), dy });
  });
  observe('longtask', (e) => P.longtasks.push({ t: e.startTime, duration: e.duration }));
  observe('long-animation-frame', (e) => {
    P.loafs.push({
      t: e.startTime,
      duration: e.duration,
      blocking: e.blockingDuration,
      scripts: (e.scripts || []).map((s) => ({
        invoker: s.invoker,
        invokerType: s.invokerType,
        url: s.sourceURL || '',
        fn: s.sourceFunctionName || '',
        char: s.sourceCharPosition ?? -1,
        duration: s.duration,
        forcedLayout: s.forcedStyleAndLayoutDuration || 0,
      })),
    });
  });
}

/** CLS: the largest session window (shifts less than 1 s apart, at most 5 s long). */
export function clsOf(shifts) {
  let best = 0;
  let cur = 0;
  let start = -Infinity;
  let last = -Infinity;
  for (const s of [...shifts].sort((a, b) => a.t - b.t)) {
    if (s.t - last > 1000 || s.t - start > 5000) {
      cur = 0;
      start = s.t;
    }
    cur += s.value;
    last = s.t;
    best = Math.max(best, cur);
  }
  return Math.round(best * 1000) / 1000;
}

/** TBT: the part over 50 ms of every long task that starts after FCP. */
export function tbtOf(longtasks, fcp) {
  return Math.round(longtasks.filter((t) => fcp == null || t.t >= fcp).reduce((sum, t) => sum + Math.max(0, t.duration - 50), 0));
}

/** The first stack frame with a URL: where in the app a request was made. */
function initiatorOf(init) {
  if (!init) return null;
  const frames = [];
  for (let s = init.stack; s && frames.length < 8; s = s.parent) {
    for (const f of s.callFrames || []) if (f.url) frames.push({ url: f.url, line: f.lineNumber + 1, column: f.columnNumber + 1, fn: f.functionName || '', async: s.description || null });
  }
  return {
    type: init.type,
    url: init.url || frames[0]?.url || null,
    line: init.lineNumber != null ? init.lineNumber + 1 : frames[0]?.line ?? null,
    fn: frames[0]?.fn || '',
    frames: frames.slice(0, 6),
  };
}

/** Record every request of the page through CDP. */
async function recordNetwork(cdp) {
  const byId = new Map();
  let docStart = null;
  cdp.on('Network.requestWillBeSent', (e) => {
    if (docStart == null && e.type === 'Document') docStart = e.timestamp;
    const prev = byId.get(e.requestId);
    byId.set(e.requestId, {
      url: e.request.url,
      method: e.request.method,
      type: e.type || 'Other',
      priority: e.request.initialPriority,
      initiator: initiatorOf(e.initiator),
      start: e.timestamp,
      redirectedFrom: prev ? prev.url : null,
    });
  });
  cdp.on('Network.responseReceived', (e) => {
    const r = byId.get(e.requestId);
    if (!r) return;
    const h = Object.fromEntries(Object.entries(e.response.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const t = e.response.timing;
    Object.assign(r, {
      status: e.response.status,
      mime: e.response.mimeType,
      fromCache: !!(e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromServiceWorker),
      protocol: e.response.protocol,
      encoding: h['content-encoding'] || null,
      cacheControl: h['cache-control'] || null,
      contentLength: h['content-length'] ? Number(h['content-length']) : null,
      timingAllowed: !!h['timing-allow-origin'],
      // Server wait: from the end of sending to the first byte of the response headers.
      wait: t ? Math.max(0, t.receiveHeadersEnd - t.sendEnd) : null,
    });
  });
  cdp.on('Network.loadingFinished', (e) => {
    const r = byId.get(e.requestId);
    if (r) Object.assign(r, { end: e.timestamp, bytes: e.encodedDataLength });
  });
  cdp.on('Network.loadingFailed', (e) => {
    const r = byId.get(e.requestId);
    if (r) Object.assign(r, { end: e.timestamp, failed: e.errorText || 'failed' });
  });
  await cdp.send('Network.enable');
  return () => {
    const origin = docStart ?? 0;
    return [...byId.values()].map((r) => ({
      ...r,
      // CDP timestamps are seconds on a monotonic clock; express them as ms since the document request.
      start: Math.round((r.start - origin) * 1000),
      end: r.end != null ? Math.round((r.end - origin) * 1000) : null,
      duration: r.end != null ? Math.round((r.end - r.start) * 1000) : null,
      wait: r.wait != null ? Math.round(r.wait) : null,
    }));
  };
}

/**
 * Record what the visitor sees: CDP screencast frames (sent when the screen changes), at most one
 * per 50 ms. Returns a function that stops and gives `{t, jpeg}` frames, t in ms since navigation
 * (the frame timestamps are wall-clock seconds, like performance.timeOrigin).
 */
async function recordFilmstrip(cdp, profile) {
  const frames = [];
  cdp.on('Page.screencastFrame', (e) => {
    const ts = e.metadata.timestamp * 1000;
    if (frames.length < 200 && (!frames.length || ts - frames[frames.length - 1].ts >= 50)) frames.push({ ts, jpeg: e.data });
    cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {});
  });
  const scale = Math.min(1, 360 / profile.viewport.width);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: Math.round(profile.viewport.width * scale), maxHeight: Math.round(profile.viewport.height * scale) });
  return (timeOrigin) => {
    cdp.send('Page.stopScreencast').catch(() => {});
    return frames.map((f) => ({ t: Math.max(0, Math.round(f.ts - timeOrigin)), jpeg: f.jpeg }));
  };
}

/** Everything that has to be read inside the page after it settled. */
function collectInPage() {
  const M = window.__mantis;
  const P = window.__mantisPerf || { lcp: [], shifts: [], longtasks: [], loafs: [] };
  P.flush?.();
  const nav = performance.getEntriesByType('navigation')[0];
  const sel = (el) => {
    try {
      return el && el.isConnected ? M.cssPath(el) : null;
    } catch {
      return null;
    }
  };
  // LCP is the largest candidate: the biggest entry, the latest of equal ones, with an element.
  const lastLcp = P.lcp.reduce((best, e) => (!best || e.size >= best.size ? e : best), null);
  const lcpEl = lastLcp?.element ?? [...P.lcp].reverse().find((e) => e.element)?.element ?? null;
  let lcpElement = null;
  if (lcpEl) {
    const r = lcpEl.getBoundingClientRect();
    const isImg = lcpEl.localName === 'img';
    const url = lastLcp?.url || null;
    lcpElement = {
      selector: sel(lcpEl),
      tag: lcpEl.localName,
      text: isImg ? '' : (lcpEl.innerText || lcpEl.textContent || '').trim().slice(0, 80),
      url,
      // the attribute as written, to check whether the server's HTML has it (or JS put it there)
      srcAttr: isImg ? lcpEl.getAttribute('src') || '' : null,
      loading: lcpEl.getAttribute?.('loading') || null,
      fetchpriority: lcpEl.getAttribute?.('fetchpriority') || null,
      preloaded: !!url && [...document.querySelectorAll('link[rel="preload"][as="image"]')].some((l) => l.href === url),
      rect: { width: Math.round(r.width), height: Math.round(r.height) },
      natural: isImg ? { width: lcpEl.naturalWidth, height: lcpEl.naturalHeight } : null,
    };
  }
  // The likeliest cause of each layout shift, above the elements that moved. Candidates: an element
  // inserted (or a container filled) or an image loaded in the second before it, and any image with
  // no size (on a slow network its size is known, and the page jumps, long before it has loaded).
  // The one about as tall as the distance the content moved wins; else the latest in time; else a
  // web font that just swapped in.
  const unsized = (img) => !(img.hasAttribute('width') && img.hasAttribute('height')) && getComputedStyle(img).aspectRatio === 'auto';
  const addedAt = new Map();
  for (const a of P.added) {
    const k = `${a.t}`;
    if (!addedAt.has(k)) addedAt.set(k, new Map());
    const byParent = addedAt.get(k);
    byParent.set(a.node.parentNode, (byParent.get(a.node.parentNode) || 0) + 1);
  }
  const causeOf = (s) => {
    const tops = s.nodes.filter((n) => n.isConnected).map((n) => n.getBoundingClientRect().top);
    const top = tops.length ? Math.min(...tops) : Infinity;
    const above = (node) => node.getBoundingClientRect().top <= top + 1;
    const near = (t) => t >= s.t - 1000 && t <= s.t + 20;
    const cands = [];
    for (const a of P.added) {
      if (!a.node.isConnected || !above(a.node) || !near(a.t)) continue;
      const parent = a.node.parentElement;
      const siblings = addedAt.get(`${a.t}`)?.get(a.node.parentNode) || 0;
      cands.push(siblings > 1 && parent ? { t: a.t, kind: 'filled', node: parent } : { t: a.t, kind: 'inserted', node: a.node });
    }
    for (const l of P.loaded) {
      if (l.node.isConnected && above(l.node) && near(l.t)) cands.push({ t: l.t, kind: unsized(l.node) ? 'unsized-image' : 'image', node: l.node });
    }
    for (const i of document.images) {
      const r = i.getBoundingClientRect();
      if (unsized(i) && r.height > 0 && r.bottom <= top + 1 && !cands.some((c) => c.node === i)) cands.push({ t: null, kind: 'unsized-image', node: i });
    }
    const fits = (c) => s.dy > 0 && Math.abs(c.node.getBoundingClientRect().height - s.dy) <= Math.max(4, s.dy * 0.3);
    const latest = (list) => list.sort((a, b) => (b.t ?? -Infinity) - (a.t ?? -Infinity))[0] ?? null;
    const fit = latest(cands.filter(fits));
    let best = fit ?? latest(cands.filter((c) => c.t != null)) ?? latest(cands);
    if (!best) best = latest(P.fontsDone.filter(near).map((t) => ({ t, kind: 'font', node: null })));
    return best ? { kind: best.kind, selector: best.node ? sel(best.node) : null, t: best.t == null ? null : Math.round(best.t), moved: Math.round(s.dy), fits: best === fit } : null;
  };
  const vh = innerHeight;
  const images = [...document.images].slice(0, 200).map((img) => {
    const r = img.getBoundingClientRect();
    return {
      selector: sel(img),
      src: img.currentSrc || img.src,
      loading: img.getAttribute('loading'),
      fetchpriority: img.getAttribute('fetchpriority'),
      hasSize: img.hasAttribute('width') && img.hasAttribute('height'),
      natural: { width: img.naturalWidth, height: img.naturalHeight },
      rendered: { width: Math.round(r.width), height: Math.round(r.height) },
      inViewport: r.bottom > 0 && r.top < vh && r.width > 0 && r.height > 0,
    };
  });
  const renderBlocking = performance.getEntriesByType('resource')
    .filter((e) => e.renderBlockingStatus === 'blocking')
    .map((e) => e.name);
  const scripts = [...document.scripts].map((s) => s.src).filter(Boolean);
  const has = (re) => scripts.some((s) => re.test(s));
  const framework = window.__NEXT_DATA__ || has(/\/_next\//) ? 'next'
    : window.__NUXT__ || has(/\/_nuxt\//) ? 'nuxt'
    : document.querySelector('[data-sveltekit-hydrate], [data-sveltekit-preload-data]') || has(/\/_app\/immutable\//) ? 'sveltekit'
    : document.querySelector('[ng-version]') ? 'angular'
    : window.__VUE__ || document.querySelector('[data-v-app]') ? 'vue'
    : document.querySelector('[data-reactroot]') || [...document.querySelectorAll('body *')].slice(0, 50).some((e) => Object.keys(e).some((k) => k.startsWith('__reactFiber'))) ? 'react'
    : null;
  const devSigns = [
    has(/\/@vite\/client/) && 'Vite dev server (/@vite/client)',
    has(/react-dom\.development/) && 'React development build',
    window.__NEXT_DATA__?.buildId === 'development' && 'Next.js dev server',
    has(/webpack-dev-server|sockjs-node/) && 'webpack dev server',
  ].filter(Boolean);
  // @font-face rules with the files they point to, from the stylesheets the page can read (not
  // cross-origin ones), to tie each font file to its font-display.
  function fontFaceRules() {
    const out = [];
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSFontFaceRule) || out.length >= 200) continue;
        const base = sheet.href || location.href;
        const urls = [...rule.style.getPropertyValue('src').matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => {
          try {
            return new URL(m[2], base).href;
          } catch {
            return null;
          }
        }).filter(Boolean);
        out.push({ family: rule.style.getPropertyValue('font-family').trim().replace(/^["']|["']$/g, ''), display: rule.style.getPropertyValue('font-display') || 'auto', urls });
      }
    }
    return out;
  }
  const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    nav: nav ? { ttfb: Math.round(nav.responseStart), dcl: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd), transfer: nav.transferSize } : null,
    fcp: P.fcp != null ? Math.round(P.fcp) : null,
    lcp: lastLcp ? Math.round(lastLcp.t) : null,
    lcpElement,
    // every candidate Chrome reported, in order: the LCP is the largest
    lcpCandidates: P.lcp.slice(-10).map((e) => ({ t: Math.round(e.t), size: e.size, url: e.url, tag: e.element?.localName ?? null })),
    shifts: P.shifts.map((s) => ({ t: Math.round(s.t), value: s.value, sources: s.nodes.map(sel).filter(Boolean).slice(0, 4), cause: causeOf(s) })),
    fonts: document.fonts ? [...document.fonts].map((f) => ({ family: f.family.replace(/^["']|["']$/g, ''), display: f.display, status: f.status })) : [],
    fontRules: fontFaceRules(),
    iframes: [...document.querySelectorAll('iframe[src]')].slice(0, 30).map((f) => {
      const r = f.getBoundingClientRect();
      return { selector: sel(f), src: f.src, loading: f.getAttribute('loading'), inViewport: r.bottom > 0 && r.top < vh && r.width > 0 && r.height > 0 };
    }),
    longtasks: P.longtasks.map((t) => ({ t: Math.round(t.t), duration: Math.round(t.duration) })),
    loafs: P.loafs.filter((f) => f.blocking > 0 || f.duration > 50).map((f) => ({ ...f, t: Math.round(f.t), duration: Math.round(f.duration), blocking: Math.round(f.blocking) })),
    images,
    renderBlocking,
    framework,
    devSigns,
    inventory: {
      textLength: text.length,
      viewportImages: images.filter((i) => i.inViewport).length,
      headings: document.querySelectorAll('h1, h2, h3').length,
      controls: document.querySelectorAll('a[href], button, input, select, textarea, [role="button"]').length,
      domSize: document.getElementsByTagName('*').length,
    },
  };
}

/**
 * Wait until the images on the first screen have loaded (lazy ones don't hold the load event, and a
 * slow one can arrive after the network looked quiet), then two frames, so their LCP entry is in.
 */
async function settleImages(page, timeout) {
  await page.waitForFunction(() => [...document.images].every((img) => {
    const r = img.getBoundingClientRect();
    return img.complete || !(r.bottom > 0 && r.top < innerHeight && r.width > 0);
  }), null, { timeout: Math.min(timeout, 10000), polling: 200 }).catch(() => {});
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))).catch(() => {});
}

/**
 * Measure one cold visit.
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @param {typeof PERF_PROFILES.mobile} profile
 * @param {{storageState?: object|null, timeout?: number}} [opts]
 */
export async function measureVisit(browser, url, profile, { storageState = null, timeout = 60000 } = {}) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    serviceWorkers: 'block',
    ignoreHTTPSErrors: true,
    ...(storageState ? { storageState } : {}),
  });
  try {
    await context.addInitScript(perfInitScript);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const requests = await recordNetwork(cdp);
    const frames = await recordFilmstrip(cdp, profile);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (profile.cpuSlowdown > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuSlowdown });
    if (profile.network) await cdp.send('Network.emulateNetworkConditions', { offline: false, ...profile.network });
    const response = await page.goto(url, { waitUntil: 'load', timeout });
    try {
      await page.waitForLoadState('networkidle', { timeout: 15000 });
    } catch {
      // keep what loaded; a page that never goes quiet is measured as it is
    }
    await page.waitForTimeout(1500); // late LCP candidates and long tasks after load
    await settleImages(page, timeout);
    if (profile.cpuSlowdown > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await page.evaluate(installMantisLib, { ignore: [] });
    const data = await page.evaluate(collectInPage);
    data.filmstrip = frames(await page.evaluate(() => performance.timeOrigin));
    const reqs = requests();
    const blocking = new Set(data.renderBlocking);
    for (const r of reqs) r.renderBlocking = blocking.has(r.url);
    if (data.lcpElement?.srcAttr) {
      // In the HTML the server sent, the preload scanner finds the image early; put there by JS, it waits for the script.
      const html = await response?.text().catch(() => '') ?? '';
      data.lcpElement.inHtml = html.includes(data.lcpElement.srcAttr);
    }
    return {
      status: response ? response.status() : null,
      metrics: {
        ttfb: data.nav?.ttfb ?? null,
        fcp: data.fcp,
        lcp: data.lcp,
        cls: clsOf(data.shifts),
        tbt: tbtOf(data.longtasks, data.fcp),
        dcl: data.nav?.dcl ?? null,
        load: data.nav?.load ?? null,
        requests: reqs.length,
        bytes: reqs.reduce((s, r) => s + (r.bytes || 0), 0),
      },
      ...data,
      requests: reqs,
    };
  } finally {
    await context.close();
  }
}

/**
 * One unthrottled visit for what throttling or overhead would distort:
 * - requests with the server's real wait (network throttling holds every response for at least its
 *   latency, which hides a slow API behind it);
 * - used and unused bytes per script and stylesheet (coverage disables some optimizations);
 * - the functions the main thread spent its time in, from V8's sampling profiler (long animation
 *   frames often only name the promise continuation, the profiler names the function).
 */
export async function measureTrace(browser, url, profile, { storageState = null, timeout = 60000 } = {}) {
  const context = await browser.newContext({
    viewport: profile.viewport,
    deviceScaleFactor: profile.deviceScaleFactor,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    serviceWorkers: 'block',
    ignoreHTTPSErrors: true,
    ...(storageState ? { storageState } : {}),
  });
  try {
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    const requests = await recordNetwork(cdp);
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
    await cdp.send('Profiler.start');
    await page.coverage.startJSCoverage({ resetOnNavigation: false, reportAnonymousScripts: false });
    await page.coverage.startCSSCoverage({ resetOnNavigation: false });
    await page.goto(url, { waitUntil: 'load', timeout });
    try {
      await page.waitForLoadState('networkidle', { timeout: 10000 });
    } catch {
      // measured as it is
    }
    await page.waitForTimeout(1000);
    const [js, css] = await Promise.all([page.coverage.stopJSCoverage(), page.coverage.stopCSSCoverage()]);
    const { profile: cpu } = await cdp.send('Profiler.stop');
    const coverage = [];
    for (const e of js) {
      if (!e.url || !e.source) continue;
      coverage.push({ url: e.url, type: 'js', total: e.source.length, unused: unusedJsBytes(e.functions) });
    }
    for (const e of css) {
      if (!e.url || !e.text) continue;
      const used = e.ranges.reduce((s, r) => s + (r.end - r.start), 0);
      coverage.push({ url: e.url, type: 'css', total: e.text.length, unused: Math.max(0, e.text.length - used) });
    }
    return { requests: requests(), coverage, hotFunctions: hotFunctions(cpu), scriptTime: scriptTime(cpu) };
  } finally {
    await context.close();
  }
}

const NOT_CODE = new Set(['(root)', '(program)', '(idle)', '(garbage collector)']);

/**
 * Self time per function in a V8 CPU profile, merged by function name and location, longest first.
 * Only functions with a source URL count: browser internals are not the app's to fix.
 */
export function hotFunctions(cpu, { min = 10 } = {}) {
  if (!cpu?.nodes) return [];
  const byId = new Map(cpu.nodes.map((n) => [n.id, n]));
  const self = new Map();
  cpu.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (cpu.timeDeltas[i] || 0) / 1000));
  const merged = new Map();
  for (const [id, ms] of self) {
    const f = byId.get(id)?.callFrame;
    if (!f || !f.url || NOT_CODE.has(f.functionName)) continue;
    const key = `${f.functionName}|${f.url}|${f.lineNumber}`;
    const m = merged.get(key) || { fn: f.functionName || '(anonymous)', url: f.url, line: f.lineNumber + 1, column: f.columnNumber + 1, self: 0 };
    m.self += ms;
    merged.set(key, m);
  }
  return [...merged.values()].map((m) => ({ ...m, self: Math.round(m.self) })).filter((m) => m.self >= min).sort((a, b) => b.self - a.self).slice(0, 15);
}

/** Main-thread self time per script URL, every function counted: what each script costs in all. */
export function scriptTime(cpu) {
  if (!cpu?.nodes) return [];
  const urlOf = new Map(cpu.nodes.map((n) => [n.id, n.callFrame?.url || '']));
  const byUrl = new Map();
  cpu.samples.forEach((id, i) => {
    const url = urlOf.get(id);
    if (url) byUrl.set(url, (byUrl.get(url) || 0) + (cpu.timeDeltas[i] || 0) / 1000);
  });
  return [...byUrl].map(([url, ms]) => ({ url, self: Math.round(ms) })).filter((s) => s.self > 0).sort((a, b) => b.self - a.self);
}

/**
 * Bytes of a script that never ran: V8 block coverage marks unexecuted ranges with count 0, nested
 * inside executed ones. Only the outermost unexecuted ranges are counted, so nothing is counted twice.
 */
export function unusedJsBytes(functions) {
  const zero = [];
  for (const f of functions || []) for (const r of f.ranges || []) if (r.count === 0) zero.push([r.startOffset, r.endOffset]);
  zero.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  let total = 0;
  let coveredUntil = -1;
  for (const [s, e] of zero) {
    if (e <= coveredUntil) continue;
    total += e - Math.max(s, coveredUntil);
    coveredUntil = Math.max(coveredUntil, e);
  }
  return total;
}
