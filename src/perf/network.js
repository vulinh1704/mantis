/**
 * The app's API calls and the third parties, as findings.
 *
 * API calls are the page's fetch/XHR requests to its own site, or to an unknown host when the app's
 * own code made them (an API on another domain). Everything else from another site is a third
 * party, grouped by vendor with its bytes, main-thread time, render-blocking files and iframes.
 */
import { fmtKb, fmtMs, shortUrl, siteOf } from './metrics.js';
import { VENDOR_FIX, vendorOf } from './vendors.js';

/** The page's own API calls among a visit's requests. */
export function appApis(requests, pageUrl) {
  const site = siteOf(pageUrl);
  const own = (u) => !!u && siteOf(u) === site;
  return requests.filter((q) => (q.type === 'Fetch' || q.type === 'XHR')
    && (own(q.url) || (vendorOf(q.url).category === 'other' && own(q.initiator?.url))));
}

/** When the page's data was in: the end of its last API call (null without any). */
export function dataReady(requests, pageUrl) {
  const ends = appApis(requests, pageUrl).map((q) => q.end).filter((t) => t != null);
  return ends.length ? Math.max(...ends) : null;
}

/** `/api/products/42?user=7` → `/api/products/:id?user=:id`: requests that differ only by ids share a pattern. */
export function apiPattern(url) {
  const u = new URL(url);
  const id = (s) => /^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s) || /^[0-9a-f]{12,}$/i.test(s);
  const p = u.pathname.split('/').map((s) => (id(s) ? ':id' : s)).join('/');
  const q = [...u.searchParams.keys()].sort().map((k) => `${k}=${id(u.searchParams.get(k)) ? ':id' : u.searchParams.get(k)}`).join('&');
  return `${p}${q ? `?${q}` : ''}`;
}

/** Where a call was made, with its callers: `loadConfig` /app.js:4 ← `main` /app.js:51. */
function where(q, origin) {
  const frames = q.initiator?.frames?.length ? q.initiator.frames : q.initiator?.url ? [{ fn: q.initiator.fn, url: q.initiator.url, line: q.initiator.line }] : [];
  return frames.filter((f) => f.fn).slice(0, 3).map((f) => `\`${f.fn}\` ${shortUrl(f.url, origin)}:${f.line}`).join(' ← ')
    || (frames[0] ? `${shortUrl(frames[0].url, origin)}:${frames[0].line}` : '');
}
const culpritOf = (q) => ({ url: q.url, ...(q.initiator?.fn ? { fn: q.initiator.fn } : {}), ...(q.initiator?.url ? { calledFrom: `${q.initiator.url}${q.initiator.line ? `:${q.initiator.line}` : ''}` } : {}) });

/**
 * Add the API and third-party findings of one route.
 * @param {object} r  the route (metrics, visit, framework)
 * @param {object} profile
 * @param {(f: object) => void} add  finalizes and collects a finding
 */
export function networkChecks(r, profile, add) {
  const v = r.visit;
  const origin = new URL(r.url).origin;
  const apis = appApis(v.requests, r.url).filter((q) => q.end != null);
  const label = (q) => `${q.method} ${shortUrl(q.url, origin)}`;
  const pattern = (q) => `${q.method} ${apiPattern(q.url).replace(/^https?:\/\/[^/]+/, '')}`;
  // An API is critical when the LCP element waited for its data: LCP text painted right after its
  // response, or an LCP image the page only asked for after it.
  const lcpImage = v.lcpElement?.url ? v.requests.find((q) => q.url === v.lcpElement.url) : null;
  const critical = (q) => v.lcp != null && v.fcp != null && v.lcp - v.fcp >= 300 && q.end <= v.lcp + 50
    && (lcpImage ? lcpImage.start >= q.end - 5 : !v.lcpElement?.url && v.lcp - q.end <= 300);
  const metricFor = (q) => (critical(q) ? 'lcp' : 'data');

  // The first call starts late: the code that makes it waited (deferred scripts run in document order).
  const docEnd = v.requests.find((q) => q.type === 'Document')?.end ?? 0;
  const first = [...apis].sort((a, b) => a.start - b.start)[0];
  const caller = first?.initiator?.url ? v.requests.find((q) => q.url === first.initiator.url && q.type === 'Script') : null;
  if (first && caller?.end != null && first.start - Math.max(docEnd, caller.end) >= 300) {
    const ready = Math.max(docEnd, caller.end);
    const blocker = v.requests
      .filter((q) => q !== caller && q.type === 'Script' && q.end != null && q.end <= first.start + 5 && first.start - q.end <= 150 && q.end > caller.end + 200)
      .sort((a, b) => b.end - a.end)[0];
    add({
      category: 'api-late', key: shortUrl(caller.url, origin), metric: metricFor(first), savings: { ms: Math.round(first.start - ready) }, confidence: 'estimated',
      title: `The first API call starts at ${fmtMs(first.start)}, ${fmtMs(first.start - ready)} after the code that makes it arrived`,
      culprit: { url: caller.url, ...(blocker ? { waitedFor: blocker.url } : {}) },
      evidence: `${shortUrl(caller.url, origin)} arrived at ${fmtMs(caller.end)} but only called ${label(first)} at ${fmtMs(first.start)}${blocker ? `, right after ${shortUrl(blocker.url, origin)} finished loading (${fmtMs(blocker.end)}): deferred scripts run in document order, so it waited for that one` : ''}.`,
      fix: `Start the data earlier: ${blocker ? `load ${shortUrl(blocker.url, origin)} after the code that fetches (or make it smaller, or \`async\`), ` : ''}preload the call in the HTML (\`<link rel="preload" as="fetch" href="${shortUrl(first.url, origin)}" crossorigin>\`), or fetch on the server and send the data with the page.`,
      fixRisk: 'medium', riskReason: 'changes when scripts run or where data is fetched',
    });
  }

  // Slow endpoints: the server's own wait, from the unthrottled visit.
  const slow = new Map();
  for (const q of apis) {
    const wait = q.serverWait ?? null;
    if (wait == null || (wait < 500 && !(wait >= 300 && critical(q)))) continue;
    const k = pattern(q);
    if (!slow.has(k) || wait > slow.get(k).serverWait) slow.set(k, q);
  }
  for (const [k, q] of slow) {
    add({
      category: 'api-slow', key: k, metric: metricFor(q), savings: { ms: Math.round(q.serverWait - 100) }, confidence: 'estimated',
      title: `${label(q)} takes ${fmtMs(q.serverWait)} on the server`,
      culprit: culpritOf(q),
      evidence: `The server waited ${fmtMs(q.serverWait)} before answering (unthrottled visit)${critical(q) ? '; the LCP was painted right after its response' : ''}. Called from ${where(q, origin) || 'the page'}.`,
      fix: 'On the server: find what this endpoint waits on (a query without an index, N+1 queries in the ORM, a call to another service), then cache the response (Cache-Control with stale-while-revalidate, or a server-side cache) or compute it ahead of time.',
      fixRisk: 'high', riskReason: 'a backend change',
    });
  }

  // Chains: a call that starts the moment another ends was waiting for it.
  const parent = new Map();
  for (const b of apis) {
    let best = null;
    for (const a of apis) {
      if (a === b || a.end > b.start + 5 || b.start - a.end > 60) continue;
      if (!best || a.end > best.end) best = a;
    }
    if (best) parent.set(b, best);
  }
  let longest = null;
  for (const b of apis) {
    const chain = [b];
    for (let p = parent.get(b); p && !chain.includes(p); p = parent.get(p)) chain.unshift(p);
    const span = chain[chain.length - 1].end - chain[0].start;
    if (chain.length >= 2 && (!longest || span > longest.span)) longest = { chain, span };
  }
  if (longest) {
    const { chain, span } = longest;
    const steps = [];
    for (const q of chain) if (steps[steps.length - 1] !== pattern(q)) steps.push(pattern(q));
    const saving = Math.round(span - Math.max(...chain.map((q) => q.duration ?? 0)));
    if (steps.length >= 2 && saving >= 100) {
      const second = chain[1];
      const last = chain[chain.length - 1];
      add({
        category: 'api-chain', key: steps.join(' → '), metric: metricFor(last), savings: { ms: saving }, confidence: 'estimated',
        title: `${chain.length} API calls wait for each other: ${steps.map((s) => s.replace(/^GET /, '')).join(' → ')}`,
        culprit: culpritOf(second),
        evidence: `Each starts when the previous one ends: ${chain.map((q) => `${shortUrl(q.url, origin)} ${fmtMs(q.start)}–${fmtMs(q.end)}`).join(', ')}. ${fmtMs(span)} in all, ${fmtMs(Math.max(...chain.map((q) => q.duration ?? 0)))} for the slowest alone. The wait starts in ${where(second, origin) || 'the page'}.`,
        fix: 'Start the calls that do not need each other\'s results together (`Promise.all`), and have the server return what the next call needs: one endpoint for the page, an `include`/expand parameter, or one GraphQL query.',
        fixRisk: 'medium', riskReason: 'changes the order of calls, or an API contract',
      });
    }
  }

  // The same call made twice.
  const same = new Map();
  for (const q of apis) {
    const k = `${q.method} ${q.url}`;
    if (!same.has(k)) same.set(k, []);
    same.get(k).push(q);
  }
  for (const [k, qs] of same) {
    if (qs.length < 2) continue;
    const [first, ...extra] = qs.sort((a, b) => a.start - b.start);
    const waited = extra.filter((q) => q.start >= first.end).reduce((s, q) => s + (q.duration ?? 0), 0);
    const kb = extra.reduce((s, q) => s + (q.bytes ?? 0), 0) / 1024;
    add({
      category: 'api-duplicate', key: k, metric: waited ? metricFor(extra[extra.length - 1]) : 'bytes',
      savings: waited ? { ms: Math.round(waited), kb: Math.round(kb) } : { kb: Math.round(kb * 10) / 10 }, confidence: 'measured',
      title: `${label(first)} is called ${qs.length} times`,
      culprit: culpritOf(extra[0]),
      evidence: `${qs.map((q) => `${fmtMs(q.start)}–${fmtMs(q.end)} from ${where(q, origin) || 'the page'}`).join('; ')}.${waited ? ` The repeat waits ${fmtMs(waited)} for an answer the page already had.` : ''}`,
      fix: 'Call it once and share the result: keep the promise in one place (a module or store), or let the data layer dedupe it (React Query, SWR, Apollo, Nuxt `useFetch` with a key).',
      fixRisk: 'low', riskReason: 'same data, one call',
    });
  }

  // N+1: one call per item.
  const byPattern = new Map();
  for (const q of apis) {
    const k = pattern(q);
    if (!k.includes(':id')) continue;
    if (!byPattern.has(k)) byPattern.set(k, []);
    byPattern.get(k).push(q);
  }
  for (const [k, qs] of byPattern) {
    const distinct = new Set(qs.map((q) => q.url));
    if (distinct.size < 4) continue;
    const span = Math.max(...qs.map((q) => q.end)) - Math.min(...qs.map((q) => q.start));
    const one = [...qs.map((q) => q.duration ?? 0)].sort((a, b) => a - b)[Math.floor(qs.length / 2)];
    add({
      category: 'api-n-plus-1', key: k, metric: metricFor(qs[qs.length - 1]), savings: { ms: Math.round(Math.max(0, span - one)) }, confidence: 'estimated',
      title: `${qs.length} calls to ${k.replace(/^GET /, '')}, one per item`,
      culprit: culpritOf(qs[0]),
      evidence: `${distinct.size} different ids from ${where(qs[0], origin) || 'the page'}, ${fmtMs(span)} from the first call to the last answer. Each one is a request the server handles on its own, and browsers open at most 6 connections per host over HTTP/1.1.`,
      fix: `Ask for all of them in one call: a batch endpoint (\`${k.replace(/^GET /, '').replace(/\/:id.*$/, '')}?ids=1,2,3\`), or include them in the response that lists them.`,
      fixRisk: 'medium', riskReason: 'needs a batch endpoint or an API change',
    });
  }

  // Large or uncompressed JSON.
  for (const q of apis) {
    const local = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/.test(new URL(q.url).hostname);
    const big = (q.bytes ?? 0) >= 100 * 1024;
    const raw = !local && !q.encoding && (q.bytes ?? 0) >= 20 * 1024;
    if (!big && !raw) continue;
    add({
      category: 'api-payload', key: `${q.method} ${q.url}`, metric: 'bytes', savings: { kb: Math.round(((q.bytes ?? 0) * (big ? 0.6 : 0.7)) / 1024) }, confidence: 'heuristic',
      title: `${label(q)} sends ${fmtKb(q.bytes)}${raw ? ' uncompressed' : ''}`,
      culprit: culpritOf(q),
      evidence: `${fmtKb(q.bytes)} transferred${q.encoding ? ` (${q.encoding})` : ', no content-encoding'}.`,
      fix: `Return only what the page shows: paginate, select fields${raw ? ', and compress JSON (Brotli or gzip)' : ''}.`,
      fixRisk: 'medium', riskReason: 'an API contract change',
    });
  }

  // Third parties, grouped by vendor.
  const apiSet = new Set(apis);
  const site = siteOf(r.url);
  const vendors = new Map();
  const vendorFor = (url) => {
    const vd = vendorOf(url);
    if (!vendors.has(vd.id)) vendors.set(vd.id, { ...vd, requests: [], main: 0, frames: 0, iframes: [] });
    return vendors.get(vd.id);
  };
  for (const q of v.requests) if (siteOf(q.url) !== site && !apiSet.has(q) && /^https?:/.test(q.url)) vendorFor(q.url).requests.push(q);
  for (const s of v.scriptTime ?? []) if (siteOf(s.url) !== site) vendorFor(s.url).main += s.self * profile.cpuSlowdown;
  for (const f of v.loafs ?? []) for (const s of f.scripts) if (s.url && siteOf(s.url) !== site) vendorFor(s.url).frames += s.duration;
  for (const f of v.iframes ?? []) if (siteOf(f.src) !== site) vendorFor(f.src).iframes.push(f);
  const fcp = v.fcp;
  for (const vd of vendors.values()) {
    const bytes = vd.requests.reduce((s, q) => s + (q.bytes ?? 0), 0);
    const main = Math.round(Math.max(vd.main, vd.frames));
    const blocking = vd.requests.filter((q) => q.renderBlocking && q.end != null && fcp != null && q.start < fcp);
    const held = blocking.length ? Math.round(Math.max(0, Math.min(Math.max(...blocking.map((q) => q.end)), fcp) - docEnd)) : 0;
    if (main < 50 && bytes < 50 * 1024 && held < 50 && !vd.iframes.length) continue;
    const kind = vd.category === 'other' ? 'third party' : vd.category.replace('-', ' ');
    const script = vd.requests.find((q) => q.type === 'Script') ?? vd.requests[0];
    const metric = held >= 50 ? 'fcp' : main >= 50 ? 'tbt' : 'bytes';
    const savings = metric === 'fcp' ? { ms: held } : metric === 'tbt' ? { ms: main - 50 } : { kb: Math.round(bytes / 1024) };
    const parts = [main >= 50 && `${fmtMs(main)} of main thread`, bytes && fmtKb(bytes), held >= 50 && `holds the first paint ${fmtMs(held)}`].filter(Boolean);
    const culprit = script ? { url: script.url, ...(script.initiator?.url ? { from: `${script.initiator.url}${script.initiator.line ? `:${script.initiator.line}` : ''}` } : {}) } : { url: vd.iframes[0]?.src };
    const evidence = `${vd.requests.length} request${vd.requests.length === 1 ? '' : 's'} (${fmtKb(bytes)})${main >= 50 ? `, ${fmtMs(main)} of main-thread work on this profile` : ''}${blocking.length ? `, render-blocking: ${blocking.map((q) => shortUrl(q.url, origin)).join(', ')}` : ''}${vd.iframes.length ? `, ${vd.iframes.length} iframe${vd.iframes.length === 1 ? '' : 's'}${vd.iframes.some((f) => f.inViewport) ? ' on the first screen' : ''}` : ''}.`;
    add({
      category: 'third-party', key: vd.id, metric, savings, confidence: 'estimated',
      title: `${vd.name} (${kind}): ${parts.join(', ') || 'an embedded iframe'}`,
      culprit, evidence,
      fix: VENDOR_FIX[vd.category] ?? VENDOR_FIX.other,
      fixRisk: 'medium', riskReason: `loading it later delays what it does${vd.category === 'chat' ? ' (the chat opens a moment later)' : vd.category === 'analytics' || vd.category === 'ads' ? ' (early bounces may go untracked)' : ''}`,
      vendor: { name: vd.name, category: vd.category, requests: vd.requests.length, bytes, mainThreadMs: main },
    });
    if (main >= 250 || bytes >= 300 * 1024) {
      add({
        category: 'third-party-cost', key: vd.id, metric: main >= 250 ? 'tbt' : 'bytes',
        savings: main >= 250 ? { ms: main - 50 } : { kb: Math.round(bytes / 1024) }, confidence: 'estimated',
        title: `Is ${vd.name} worth ${parts.slice(0, 2).join(' and ')} on every visit?`,
        culprit, evidence,
        fix: 'Decide with whoever owns it: keep it, load it only on the pages that need it, replace it with something lighter, or drop it.',
        fixRisk: 'high', riskReason: 'a product decision: the feature or the data it brings goes away',
        decision: true,
      });
    }
  }
}
