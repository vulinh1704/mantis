/**
 * Findings: what to fix first, what it should save, and how likely the fix is to break something.
 *
 * Every finding names a culprit an agent can open (a selector, a request URL, or a file:line and
 * function), the metric it moves with an estimated saving and how sure that estimate is, the fix,
 * and the detected framework's own way to do it. Findings are ranked on two axes, impact and fix
 * risk, into buckets: do first (worth it, low risk), plan (worth it, more risk), nice to have, and
 * your call (business decisions such as dropping a vendor).
 */
import { clsOf } from './measure.js';
import { fmtKb, fmtMs, rating, shortUrl, siteOf } from './metrics.js';
import { networkChecks } from './network.js';

export const BUCKETS = Object.freeze([
  { id: 'do-first', title: 'Do first', blurb: 'worth it, low risk' },
  { id: 'plan', title: 'Plan', blurb: 'worth it, the fix needs care' },
  { id: 'nice', title: 'Nice to have', blurb: 'small gains' },
  { id: 'your-call', title: 'Your call', blurb: 'a product or business decision' },
]);

const RISK_POINTS = { low: 1, medium: 2, high: 3 };
const CONFIDENCE = { measured: 1, estimated: 0.8, heuristic: 0.5 };

/**
 * Savings that make a finding medium or high impact: [medium, high]. `data` is when the page's API
 * calls are all answered, which has no Core Web Vitals threshold.
 */
const STEPS = { lcp: [250, 800], fcp: [250, 800], tbt: [100, 250], cls: [0.03, 0.1], data: [250, 800], bytes: [100, 500] };

/** The saving that counts for a metric: ms for timings, the shift score for CLS, KB for bytes. */
const savingFor = (metric, s) => (metric === 'cls' ? s.cls : metric === 'bytes' ? s.kb : s.ms) ?? 0;

/** Order within a bucket: the saving in units of its "high" step (capped at 3), times confidence, over fix risk. */
export function scoreOf(f) {
  const magnitude = Math.min(3, savingFor(f.metric, f.savings) / STEPS[f.metric][1]);
  return Math.round(((magnitude * CONFIDENCE[f.confidence]) / RISK_POINTS[f.fixRisk]) * 100) / 100;
}

/**
 * High when the saving is large, or when it moves the metric across a Core Web Vitals threshold;
 * a metric that is already good caps it at medium, since users feel less of it.
 */
export function impactOf(metric, saving, median) {
  const [mid, big] = STEPS[metric];
  if (metric === 'bytes' || median == null) return saving >= big ? 'high' : saving >= mid ? 'medium' : 'low';
  const now = rating(metric, median);
  const crosses = rating(metric, Math.max(0, median - saving)) !== now;
  const impact = saving >= big || (crosses && saving >= mid) ? 'high' : saving >= mid ? 'medium' : 'low';
  return now === 'good' && impact === 'high' ? 'medium' : impact;
}

export function bucketOf(f) {
  if (f.decision) return 'your-call';
  if (f.fixRisk === 'low' && f.impact !== 'low') return 'do-first';
  if (f.impact === 'high' || (f.impact === 'medium' && f.fixRisk === 'medium')) return 'plan';
  return 'nice';
}

export function savingLabel(f) {
  const m = f.metric;
  if (m === 'bytes') return `−${fmtKb(Math.round(f.savings.kb * 1024))}`;
  if (m === 'cls') return f.savings.cls > 0 ? `CLS −${f.savings.cls}` : `shift ${f.savings.shift}`;
  return `${m === 'data' ? 'data' : m.toUpperCase()} −${fmtMs(f.savings.ms)}`;
}

/** The framework's own way to apply a fix, by category. */
const FRAMEWORK_FIX = {
  'lcp-lazy': {
    next: 'next/image: `<Image priority … />` (no `loading="lazy"`).',
    nuxt: '@nuxt/image: `<NuxtImg preload loading="eager" fetchpriority="high" … />`.',
    angular: 'NgOptimizedImage: `<img ngSrc="…" priority>`.',
  },
  'lcp-discovery': {
    next: 'next/image with `priority` puts the image in the server HTML with a preload.',
    nuxt: '@nuxt/image: `<NuxtImg preload … />` rendered on the server.',
    angular: 'NgOptimizedImage with `priority`, rendered on the server.',
    react: 'Render the hero `<img>` on the server, or add `<link rel="preload" as="image">` in the HTML head.',
  },
  'image-oversized': {
    next: 'next/image with a `sizes` that matches the layout serves resized AVIF/WebP.',
    nuxt: '@nuxt/image: `<NuxtImg sizes="sm:100vw md:50vw" format="avif,webp" … />`.',
    angular: 'NgOptimizedImage with `ngSrcset` and `sizes`, behind an image loader/CDN.',
    sveltekit: '@sveltejs/enhanced-img: `<enhanced:img src="…" sizes="…" />`.',
  },
  'render-blocking': {
    next: 'Load third-party and non-critical scripts with next/script `strategy="afterInteractive"` or `"lazyOnload"`.',
    nuxt: '`useHead({ script: [{ src, defer: true }] })`, or useScript for third parties.',
  },
  'long-task': {
    react: 'Memoize it (`useMemo`), keep urgent updates responsive with `useDeferredValue`/`startTransition`, and virtualize long lists.',
    next: 'Memoize it (`useMemo`), keep urgent updates responsive with `useDeferredValue`/`startTransition`, and virtualize long lists.',
    vue: 'Move it into a `computed`, skip unchanged rows with `v-memo`, and virtualize long lists.',
    nuxt: 'Move it into a `computed`, skip unchanged rows with `v-memo`, and virtualize long lists.',
    angular: 'Use `OnPush` change detection and `track` in `@for`, and run heavy work outside the zone or in a web worker.',
  },
  'unused-code': {
    next: 'Load the parts the first screen does not need with `next/dynamic`.',
    react: 'Split it with `React.lazy` and `Suspense`, or a dynamic `import()` where it is needed.',
    vue: 'Split it with `defineAsyncComponent` and lazy-loaded routes.',
    nuxt: 'Use lazy components (`<LazyMyChart />`) and per-route chunks.',
    angular: 'Wrap what the first screen does not need in `@defer` blocks; lazy-load routes.',
    sveltekit: 'Import heavy components with a dynamic `import()` where they are used.',
  },
  font: {
    next: '`next/font` self-hosts the font with `display: swap` and the fallback metrics adjusted.',
    nuxt: '@nuxt/fonts sets `font-display` and fallback metrics for you.',
  },
  server: {
    next: 'Render the route statically or with ISR (`export const revalidate = …`), and look for slow data fetching in server components.',
    nuxt: 'Cache the route with `routeRules` (`swr`/`isr`), and look for slow data fetching on the server.',
  },
};

const firstPartyOf = (pageUrl) => {
  const site = siteOf(pageUrl);
  return (url) => siteOf(url) === site;
};

/**
 * Findings for one measured route.
 * @param {object} r  a route of the perf report (metrics, visit, framework)
 * @param {object} profile  the PERF_PROFILES entry it was measured with
 */
export function findRouteIssues(r, profile) {
  const v = r.visit;
  const origin = new URL(r.url).origin;
  const firstParty = firstPartyOf(r.url);
  const medianOf = (m) => r.metrics?.[m]?.median ?? null;
  const reqByUrl = new Map();
  for (const q of v.requests) if (!reqByUrl.has(q.url)) reqByUrl.set(q.url, q);
  const doc = v.requests.find((q) => q.type === 'Document');
  const docEnd = doc?.end ?? 0;
  const bytesPerMs = profile.network ? profile.network.downloadThroughput / 1000 : null;
  const out = [];
  const add = (f) => {
    const saving = savingFor(f.metric, f.savings);
    const impact = impactOf(f.metric, saving, f.metric === 'bytes' ? null : medianOf(f.metric));
    const frameworkFix = r.framework && FRAMEWORK_FIX[f.category]?.[r.framework] ? { framework: r.framework, text: FRAMEWORK_FIX[f.category][r.framework] } : null;
    const finding = { id: `${f.category}:${f.key}`, ...f, impact, frameworkFix, routes: [r.route] };
    delete finding.key;
    finding.bucket = bucketOf(finding);
    finding.score = scoreOf(finding);
    out.push(finding);
  };

  // The LCP image: lazy-loaded, or found late (a CSS background, or put in the page by a script).
  // Nothing done to the image brings LCP before the first paint, so savings stop at LCP − FCP.
  const e = v.lcpElement;
  const lcpReq = e?.url ? reqByUrl.get(e.url) : null;
  const imageRoom = v.lcp != null && v.fcp != null ? Math.max(0, v.lcp - v.fcp) : Infinity;
  if (e && lcpReq) {
    const waited = Math.round(Math.min(Math.max(0, lcpReq.start - docEnd), imageRoom));
    const culprit = { selector: e.selector, url: e.url };
    if (e.loading === 'lazy' && waited >= 50) {
      add({
        category: 'lcp-lazy', key: e.url, metric: 'lcp', savings: { ms: waited }, confidence: 'estimated',
        title: 'The LCP image is lazy-loaded',
        culprit,
        evidence: `\`${e.selector}\` has loading="lazy": its request started ${fmtMs(Math.max(0, lcpReq.start - docEnd))} after the HTML arrived, once layout found it on screen.`,
        fix: 'Remove `loading="lazy"` from the image the page opens with and add `fetchpriority="high"`. Keep lazy loading for images below the fold.',
        fixRisk: 'low', riskReason: 'one attribute on one image',
      });
    } else if (waited >= 100 && (e.tag !== 'img' || e.inHtml === false) && !e.preloaded) {
      const how = e.tag !== 'img' ? 'is a CSS background, found only once the stylesheet is applied' : 'is not in the HTML the server sends: a script puts it there';
      add({
        category: 'lcp-discovery', key: e.url, metric: 'lcp', savings: { ms: waited }, confidence: 'estimated',
        title: 'The LCP image is found late',
        culprit,
        evidence: `\`${e.selector}\` ${how}. Its request started ${fmtMs(Math.max(0, lcpReq.start - docEnd))} after the HTML arrived.`,
        fix: `Put the image in the HTML as an \`<img fetchpriority="high">\`, or preload it: \`<link rel="preload" as="image" href="${shortUrl(e.url, origin)}" fetchpriority="high">\`.`,
        fixRisk: e.tag !== 'img' ? 'medium' : 'low', riskReason: e.tag !== 'img' ? 'turning a background into an <img> changes markup and styles' : 'a preload tag in the head',
      });
    }
  }

  // Images far larger than they are drawn, or in a legacy format.
  const dpr = profile.deviceScaleFactor;
  for (const img of v.images ?? []) {
    const req = reqByUrl.get(img.src);
    if (!req?.bytes || req.bytes < 20 * 1024 || !img.natural.width || !img.rendered.width) continue;
    const need = { width: Math.round(img.rendered.width * dpr), height: Math.round(img.rendered.height * dpr) };
    if (img.natural.width <= 1.5 * need.width) continue;
    const ratio = Math.min(1, (need.width * need.height) / (img.natural.width * img.natural.height));
    const legacy = /^image\/(png|jpeg)$/.test(req.mime ?? '');
    const kept = req.bytes * ratio * (legacy ? 0.7 : 1);
    const savedBytes = req.bytes - kept;
    const isLcp = e?.url === img.src;
    const timed = isLcp && bytesPerMs;
    add({
      category: 'image-oversized', key: img.src,
      metric: timed ? 'lcp' : 'bytes',
      savings: { kb: Math.round(savedBytes / 1024), ...(timed ? { ms: Math.round(Math.min(savedBytes / bytesPerMs, imageRoom)) } : {}) },
      confidence: 'estimated',
      title: `${shortUrl(img.src, origin).split('/').pop()} is ${(img.natural.width / need.width).toFixed(1)}× wider than it is drawn${legacy ? ', as ' + req.mime.split('/')[1].toUpperCase() : ''}`,
      culprit: { selector: img.selector, url: img.src },
      evidence: `${img.natural.width}×${img.natural.height} downloaded (${fmtKb(req.bytes)}), drawn at ${img.rendered.width}×${img.rendered.height} CSS px = ${need.width}×${need.height} device px${isLcp ? '; it is the LCP element' : ''}.`,
      fix: `Serve sizes that match the layout with \`srcset\` and \`sizes\`${legacy ? ', in AVIF or WebP' : ''}.`,
      fixRisk: 'low', riskReason: 'the same image, smaller',
    });
  }

  // The app's scripts and stylesheets that hold the first paint (a vendor's are part of its finding).
  // They download side by side, so they are one finding: the first paint can only move up once none
  // of them blocks it.
  const fcp = v.fcp;
  const blocking = v.requests.filter((q) => q.renderBlocking && q.end != null && fcp != null && q.start < fcp && firstParty(q.url) && (q.type === 'Script' || q.type === 'Stylesheet'));
  const held = blocking.length ? Math.round(Math.max(0, Math.min(Math.max(...blocking.map((q) => q.end)), fcp) - docEnd)) : 0;
  if (held >= 50) {
    const scripts = blocking.filter((q) => q.type === 'Script');
    const each = blocking.map((q) => {
      const tiny = q.bytes != null && q.bytes < 2048;
      const how = q.type === 'Script' ? (tiny ? 'inline it, or add `defer`' : 'add `defer` (or `async` when nothing depends on it running in order)') : tiny ? 'inline it in a `<style>`' : 'inline the CSS the first screen needs and load the rest without blocking';
      return `${shortUrl(q.url, origin)}: ${how}`;
    });
    add({
      category: 'render-blocking', key: shortUrl(r.url, origin), metric: 'fcp', savings: { ms: held }, confidence: 'estimated',
      title: `${blocking.length === 1 ? 'A file' : `${blocking.length} files`} in <head> hold${blocking.length === 1 ? 's' : ''} the first paint: ${blocking.map((q) => shortUrl(q.url, origin)).join(', ')}`,
      culprit: { url: blocking[0].url, ...(blocking[0].initiator?.line ? { from: `${shortUrl(blocking[0].initiator.url ?? r.url, origin)}:${blocking[0].initiator.line}` } : {}) },
      evidence: `Nothing is painted until they arrive, ${fmtMs(held)} after the HTML did: ${blocking.map((q) => `${shortUrl(q.url, origin)} ends at ${fmtMs(q.end)}${q.serverWait != null && q.serverWait >= 100 ? ` (${fmtMs(q.serverWait)} waiting on the server)` : ''}`).join('; ')}.`,
      fix: `${each.join('; ')}.`,
      fixRisk: 'medium', riskReason: scripts.length ? 'defer changes when a script runs: code that expects it to have run earlier can break' : 'loading CSS later can flash unstyled content',
    });
  }

  // First-party functions that hold the main thread (third parties are grouped by vendor).
  const slowdown = profile.cpuSlowdown;
  for (const f of v.hotFunctions ?? []) {
    if (!firstParty(f.url)) continue;
    const onProfile = f.self * slowdown;
    const inLongFrame = (v.loafs ?? []).some((l) => l.blocking > 0 && l.scripts.some((s) => s.url === f.url));
    if (onProfile < 100 && !(onProfile >= 50 && inLongFrame)) continue;
    // In a minified bundle everything is on line 1: the column finds the function.
    const minified = f.line <= 2;
    const where = `${shortUrl(f.url, origin)}:${f.line}${minified ? `:${f.column}` : ''}`;
    const anonymous = f.fn === '(anonymous)';
    // An anonymous "function" at 1:1 is the script's own top level: what it runs as it loads.
    const topLevel = anonymous && f.line === 1 && f.column === 1;
    const who = topLevel ? `The top-level code of ${shortUrl(f.url, origin)}` : anonymous ? `An anonymous function at ${where}` : `\`${f.fn}\``;
    add({
      category: 'long-task', key: `${f.url}:${f.line}:${f.column}:${f.fn}`, metric: 'tbt', savings: { ms: Math.round(onProfile - 50) }, confidence: 'estimated',
      title: `${who} holds the main thread for about ${fmtMs(onProfile)}`,
      culprit: { url: f.url, line: f.line, ...(minified ? { column: f.column } : {}), fn: f.fn },
      evidence: `${fmtMs(f.self)} of its own time in the unthrottled profile${slowdown > 1 ? `, about ${fmtMs(onProfile)} on this profile's ${slowdown}× slower CPU` : ''}, at ${where}${minified ? ' (a minified bundle: open it with its source map, or measure a build with readable names)' : ''}. The page cannot respond to taps meanwhile.`,
      fix: topLevel
        ? 'Run less as the script loads: move setup that the first screen does not need behind the first interaction or `requestIdleCallback`, and split the bundle so this route loads less code.'
        : `Make ${anonymous ? 'that function' : `\`${f.fn}\``} do less on the main thread: take repeated work out of loops, compute once and reuse, render only what is visible, yield between chunks (\`await scheduler.yield()\`), or move pure computation to a Web Worker.`,
      fixRisk: 'medium', riskReason: 'changes the logic of the code that does the work',
    });
  }

  // First-party bundles and stylesheets mostly never used on this page.
  for (const c of v.coverage ?? []) {
    if (!firstParty(c.url) || c.unused < 20 * 1024 || c.unused / c.total < 0.5) continue;
    const transfer = reqByUrl.get(c.url)?.bytes ?? c.total;
    const kb = Math.round(((c.unused / c.total) * transfer) / 1024);
    const js = c.type === 'js';
    const share = Math.round((c.unused / c.total) * 100);
    add({
      category: js ? 'unused-code' : 'unused-css', key: c.url, metric: 'bytes', savings: { kb }, confidence: 'measured',
      title: js ? `${share}% of ${shortUrl(c.url, origin)} never runs on this page` : `${share}% of the CSS in ${shortUrl(c.url, origin)} matches nothing on this page`,
      culprit: { url: c.url },
      evidence: `${fmtKb(c.unused)} of ${fmtKb(c.total)} ${js ? 'of code never ran' : 'of CSS rules matched nothing'} (Chromium coverage, until the page was quiet).`,
      fix: js ? 'Split it: ship what this route runs and load the rest with a dynamic `import()` where it is needed.' : 'Remove unused rules (Tailwind `content`, PurgeCSS) or split the CSS per route.',
      fixRisk: 'medium', riskReason: js ? 'code moved behind import() must still load before it is needed' : 'a rule only used after an interaction can be removed by mistake',
    });
  }

  // Web fonts that hide text until they arrive. A file is tied to its font-display through the
  // @font-face rules the page can read; files from stylesheets it can't read (cross-origin) count
  // only when every loaded font face hides text.
  const fontReqs = v.requests.filter((q) => q.type === 'Font' && q.end != null);
  const rules = v.fontRules ?? [];
  const hidesText = (d) => d === 'auto' || d === 'block';
  const ruleOf = (q) => rules.find((r) => r.urls.includes(q.url));
  const faces = (v.fonts ?? []).filter((f) => f.status === 'loaded');
  const allHide = faces.length > 0 && faces.every((f) => hidesText(f.display));
  const hidingReqs = fontReqs.filter((q) => (ruleOf(q) ? hidesText(ruleOf(q).display) : allHide));
  if (hidingReqs.length) {
    // With block or auto, text in the font is invisible from the font's request until it arrives (at most 3 s).
    const firstFont = Math.min(...hidingReqs.map((q) => q.start));
    const lastFont = Math.max(...hidingReqs.map((q) => q.end));
    const hidden = Math.round(Math.min(3000, Math.max(0, lastFont - firstFont)));
    const textLcp = e && e.tag !== 'img' && !e.url;
    const families = [...new Set(hidingReqs.map((q) => ruleOf(q)?.family).filter(Boolean))];
    const names = families.length ? families : [...new Set(faces.map((f) => f.family))];
    const display = ruleOf(hidingReqs[0])?.display ?? faces[0]?.display ?? 'auto';
    if (hidden >= 50) add({
      category: 'font', key: names.slice().sort().join(','), metric: textLcp ? 'lcp' : 'fcp',
      savings: { ms: hidden }, confidence: 'heuristic',
      title: `Text stays invisible until the web font arrives: ${names.slice(0, 3).join(', ')}${names.length > 3 ? ', …' : ''}`,
      culprit: { url: hidingReqs[0].url },
      evidence: `font-display is ${display}: text in it is hidden from ${fmtMs(firstFont)}, when the font is requested, until ${fmtMs(lastFont)}, when ${hidingReqs.length === 1 ? 'it arrives' : `the last of its ${hidingReqs.length} files arrives`}.`,
      fix: 'Add `font-display: swap` to each @font-face (or `optional`, which never shifts the layout) and preload the one font the first screen uses.',
      fixRisk: 'low', riskReason: 'text shows in the fallback font for a moment',
    });
  }

  // Layout shifts, grouped by what caused them. CLS is the worst burst of shifts, not their sum, so
  // a cause saves what CLS would drop without its shifts.
  const shifts = v.shifts ?? [];
  const cls = clsOf(shifts);
  const groups = new Map();
  for (const s of shifts) {
    const c = s.cause;
    const key = c ? `${c.kind}|${c.selector ?? ''}` : `unknown|${s.sources[0] ?? ''}`;
    const g = groups.get(key) ?? { cause: c, value: 0, shifts: [], moved: new Set() };
    g.value += s.value;
    g.shifts.push(s);
    for (const x of s.sources) g.moved.add(x);
    groups.set(key, g);
  }
  for (const [key, g] of groups) {
    if (g.value < 0.01) continue;
    const kind = g.cause?.kind ?? 'unknown';
    const sel = g.cause?.selector ?? [...g.moved][0] ?? 'the page';
    const moved = [...g.moved].slice(0, 3).map((x) => `\`${x}\``).join(', ');
    const text = {
      'unsized-image': [`\`${sel}\` has no width and height: content jumps when it loads`, 'Give it `width` and `height` attributes (or CSS `aspect-ratio`) so its space is kept before it loads.'],
      image: [`Content jumps when \`${sel}\` loads`, 'Keep the space of the image (or its container) before it loads: `aspect-ratio` or a min-height.'],
      inserted: [`\`${sel}\` is inserted above content that is already on screen`, 'Keep its space before it arrives (min-height), render it with the page, or show it over the content (position: fixed or sticky) instead of pushing the page down.'],
      filled: [`\`${sel}\` grows when its content arrives and pushes down what is below`, 'Keep its space with a skeleton or a min-height of the expected size, or render the content with the page.'],
      font: ['Text reflows when the web font swaps in', 'Use `font-display: optional`, or match the fallback font metrics with `size-adjust` and `ascent-override`.'],
      unknown: [`${moved || 'Content'} moves after it is shown`, 'Find what changes size above it and keep that space from the start.'],
    }[kind];
    const without = clsOf(shifts.filter((s) => !g.shifts.includes(s)));
    const saving = Math.round(Math.max(0, cls - without) * 1000) / 1000;
    const value = Math.round(g.value * 1000) / 1000;
    add({
      category: 'cls-source', key, metric: 'cls',
      savings: { cls: saving, shift: value },
      // Sure when the cause is as tall as the distance the content moved, or was seen happening just before.
      confidence: kind === 'unknown' ? 'heuristic' : g.cause.fits || g.cause.t != null ? 'measured' : 'estimated',
      title: text[0],
      culprit: { selector: g.cause?.selector ?? [...g.moved][0] ?? null },
      evidence: `${g.shifts.length} layout shift${g.shifts.length === 1 ? '' : 's'} worth ${value}${g.cause?.t != null ? ` at ${fmtMs(g.cause.t)}` : ''}; moved: ${moved || 'unknown'}${g.cause?.moved ? `, ${g.cause.moved} px down${g.cause.fits ? `, as tall as \`${sel}\`` : ''}` : ''}.${
        saving === 0 ? ` CLS (${cls}) comes from a worse burst of shifts, so this one counts only once that is fixed.`
        : saving < value ? ` CLS counts the worst burst of shifts only, so fixing this alone takes it from ${cls} to ${Math.round(without * 1000) / 1000}.` : ''}`,
      fix: text[1],
      fixRisk: 'low', riskReason: 'reserves space, no behavior change',
    });
  }

  // The HTML itself is slow to come.
  if (doc?.serverWait != null && doc.serverWait > 600) {
    add({
      category: 'server', key: doc.url, metric: 'lcp', savings: { ms: Math.round(doc.serverWait - 200) }, confidence: 'estimated',
      title: `The server takes ${fmtMs(doc.serverWait)} to start sending the page`,
      culprit: { url: doc.url },
      evidence: `Time to first byte of the HTML, unthrottled: ${fmtMs(doc.serverWait)}. Nothing can start before it.`,
      fix: 'Cache the HTML (CDN or edge, stale-while-revalidate) or render it ahead of time, and find what the server waits on: database queries, upstream APIs, cold starts.',
      fixRisk: 'high', riskReason: 'a backend or hosting change',
    });
  }

  // Text sent uncompressed. Only checked away from local servers, which rarely compress like production.
  if (!isLocal(r.url) && !r.devServer) {
    const raw = v.requests.filter((q) => !q.encoding && (q.bytes ?? 0) >= 10 * 1024 && firstParty(q.url) && /^(text\/|application\/(javascript|json|xml))|\+json$/.test(q.mime ?? ''));
    if (raw.length) {
      const total = raw.reduce((s, q) => s + q.bytes, 0);
      add({
        category: 'transfer', key: siteOf(r.url), metric: 'bytes', savings: { kb: Math.round((total * 0.7) / 1024) }, confidence: 'heuristic',
        title: `${raw.length} text file${raw.length === 1 ? ' is' : 's are'} sent uncompressed`,
        culprit: { url: raw[0].url },
        evidence: `${raw.map((q) => shortUrl(q.url, origin)).slice(0, 4).join(', ')}${raw.length > 4 ? ', …' : ''}: ${fmtKb(total)} with no content-encoding.`,
        fix: 'Turn on Brotli or gzip for text responses in the server or CDN.',
        fixRisk: 'low', riskReason: 'a server setting',
      });
    }
  }

  networkChecks(r, profile, add);
  return out;
}

export const isLocal = (url) => /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/.test(new URL(url).hostname);

const BUCKET_ORDER = Object.fromEntries(BUCKETS.map((b, i) => [b.id, i]));

/**
 * Merge the findings of every route (the same culprit on two routes is one finding that lists both,
 * keeping the larger saving) and rank them: bucket, then score, then the saving.
 */
export function rankFindings(perRoute) {
  const byId = new Map();
  for (const f of perRoute.flat()) {
    const prev = byId.get(f.id);
    if (!prev) {
      byId.set(f.id, { ...f, routes: [...f.routes] });
      continue;
    }
    const routes = [...new Set([...prev.routes, ...f.routes])];
    const better = f.score > prev.score || (f.score === prev.score && savingFor(f.metric, f.savings) > savingFor(prev.metric, prev.savings));
    byId.set(f.id, { ...(better ? f : prev), routes });
  }
  return [...byId.values()].sort((a, b) => BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || b.score - a.score || normSaving(b) - normSaving(a));
}

/** A saving on one scale for ties: share of the metric's medium step. */
const normSaving = (f) => savingFor(f.metric, f.savings) / STEPS[f.metric][0];
