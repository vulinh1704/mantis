/**
 * request-failed (warn): same-origin subresource requests that failed at the network level or
 * answered 4xx/5xx. Aborted requests (navigation, media preload) and the browser's automatic
 * /favicon.ico probe are ignored. A main-document failure is reported by the runner as an
 * error instead, since the whole cell is then meaningless.
 */
export default {
  name: 'request-failed',
  phase: 'final',
  async run(page, ctx) {
    const origin = new URL(ctx.url).origin;
    const issues = [];
    const seen = new Set();
    const pathOf = (url) => {
      const u = new URL(url);
      return u.pathname + u.search;
    };
    const sameOrigin = (url) => {
      try {
        return new URL(url).origin === origin;
      } catch {
        return false;
      }
    };
    for (const r of ctx.network.responses) {
      if (r.isMain || !sameOrigin(r.url)) continue;
      const path = pathOf(r.url);
      if (path === '/favicon.ico') continue;
      const key = `${r.method} ${path} ${r.status}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        type: 'request-failed',
        severity: 'warn',
        key,
        selector: null,
        rect: null,
        message: `${r.method} ${path} returned HTTP ${r.status} (${r.resourceType}).`,
        evidence: { url: r.url, status: r.status, method: r.method, resourceType: r.resourceType },
      });
    }
    for (const f of ctx.network.failed) {
      if (f.isMain || !sameOrigin(f.url)) continue;
      if (/ERR_ABORTED|NS_BINDING_ABORTED/i.test(f.failure || '')) continue;
      const path = pathOf(f.url);
      if (path === '/favicon.ico') continue;
      const key = `${f.method} ${path} ${f.failure}`;
      if (seen.has(key)) continue;
      seen.add(key);
      issues.push({
        type: 'request-failed',
        severity: 'warn',
        key,
        selector: null,
        rect: null,
        message: `${f.method} ${path} failed: ${f.failure} (${f.resourceType}).`,
        evidence: { url: f.url, failure: f.failure, method: f.method, resourceType: f.resourceType },
      });
    }
    return issues;
  },
};
