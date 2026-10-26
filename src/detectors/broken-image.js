/**
 * broken-image (error): a rendered <img> that finished loading with naturalWidth 0, confirmed
 * with img.decode() (which resolves for valid images without intrinsic size, e.g. some SVGs).
 * Images still loading (lazy, not yet in view) and <img> without a src are not reported.
 */
export default {
  name: 'broken-image',
  phase: 'dom',
  async run(page, ctx) {
    const statuses = {};
    for (const r of ctx.network?.responses ?? []) statuses[r.url] = r.status;
    for (const f of ctx.network?.failed ?? []) if (!(f.url in statuses)) statuses[f.url] = f.failure || 'failed';
    return page.evaluate(async (statuses) => {
      const M = window.__mantis;
      M.reset();
      const issues = [];
      for (const img of document.images) {
        if (M.ignored(img)) continue;
        const src = img.currentSrc || img.getAttribute('src') || '';
        if (!src.trim()) continue;
        if (!img.complete || img.naturalWidth > 0) continue;
        if (M.style(img).display === 'none' || !img.isConnected) continue;
        const r = img.getBoundingClientRect();
        if (r.width === 0 && r.height === 0 && !img.getAttribute('width')) continue;
        try {
          await img.decode();
          continue;
        } catch {
          // broken
        }
        const url = img.currentSrc || img.src;
        const status = statuses[url];
        const sel = M.cssPath(img);
        let shown = url;
        try {
          const u = new URL(url);
          if (u.origin === location.origin) shown = u.pathname + u.search;
        } catch {
          // keep as is
        }
        issues.push({
          type: 'broken-image',
          severity: 'error',
          selector: sel,
          rect: M.round(M.docRect(img)),
          message: `Image failed to load: ${shown}${status ? ` (${typeof status === 'number' ? 'HTTP ' + status : status})` : ''}${img.alt ? ` — alt "${M.snippet(img.alt, 40)}"` : ' — and it has no alt text'}.`,
          evidence: { src: url, status: status ?? null, alt: img.getAttribute('alt') },
        });
      }
      return issues;
    }, statuses);
  },
};
