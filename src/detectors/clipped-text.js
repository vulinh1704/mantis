/**
 * clipped-text: visible text whose content is cut, plus short labels that wrap badly.
 *
 * - error "cut": text extends past an ancestor (or its own box) that has overflow hidden/clip and
 *   whose content really overflows (scrollWidth/scrollHeight > client + 1). Vertically, a line
 *   counts as cut only when more than 25% of its height is outside, which ignores glyph boxes
 *   that merely poke out of tight line-heights. Text that is entirely outside counts when it is
 *   adjacent to the clip edge (the next nav item that got pushed out), not when it is far away.
 * - warn "truncated": cut with an ellipsis (text-overflow) or -webkit-line-clamp and no way to
 *   read the full text. Intentional truncation is ignored when the clipping element, the text's
 *   element, or a close ancestor carries a `title` or `aria-label` with the full text.
 * - warn "wrap": a button (or button-styled link) or a short form label wraps onto more than two
 *   lines, or breaks inside a word.
 *
 * Not reported: visually-hidden text (clip box <= 2px, clip/clip-path tricks), collapsed regions
 * (max-height: 0), content moved by transforms inside the clipper (carousels, tickers), and
 * scroll containers (overflow: auto/scroll), since the user can scroll those.
 */
export default {
  name: 'clipped-text',
  phase: 'dom',
  async run(page) {
    return page.evaluate(() => {
      const M = window.__mantis;
      M.reset();
      const issues = [];
      const found = new Map();

      const transformedBetween = (from, to) => {
        for (let n = from; n && n !== to; n = n.parentElement) {
          const s = M.style(n);
          if ((s.transform && s.transform !== 'none') || (s.translate && s.translate !== 'none')) return true;
        }
        return false;
      };
      const visuallyHidden = (s) => {
        const clip = s.clip || '';
        if (/rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(clip)) return true;
        const cp = s.clipPath || '';
        return /inset\(\s*(50%|100%)/.test(cp);
      };

      // Returns {axis, overflow (largest single-side overflow), hidden (px of text not shown)}.
      const horizontal = (rects, box) => {
        let maxOut = 0;
        let hidden = 0;
        let visible = false;
        let adjacentHidden = false;
        const bw = box.right - box.left;
        for (const r of rects) {
          const vis = Math.min(r.right, box.right) - Math.max(r.left, box.left);
          if (vis > 1) visible = true;
          const out = Math.max(r.right - box.right, box.left - r.left);
          if (out > 2) {
            maxOut = Math.max(maxOut, out);
            hidden += Math.min(r.right - r.left, Math.max(0, r.right - box.right) + Math.max(0, box.left - r.left));
            if (vis <= 1) {
              const gap = r.left >= box.right ? r.left - box.right : box.left - r.right;
              if (gap < Math.max(48, 0.5 * bw)) adjacentHidden = true;
            }
          }
        }
        return maxOut > 2 && (visible || adjacentHidden) ? { axis: 'x', overflow: Math.round(maxOut), hidden: Math.round(hidden) } : null;
      };

      const vertical = (rects, box) => {
        let maxOut = 0;
        let hidden = 0;
        let visible = false;
        let adjacentHidden = false;
        const bh = box.bottom - box.top;
        for (const r of rects) {
          const h = r.height;
          const vis = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
          if (vis > 1) visible = true;
          const out = Math.max(r.bottom - box.bottom, box.top - r.top);
          if (out > Math.max(2, 0.25 * h)) {
            maxOut = Math.max(maxOut, out);
            hidden += Math.min(h, Math.max(0, r.bottom - box.bottom) + Math.max(0, box.top - r.top));
            if (vis <= 0) {
              const gap = r.top >= box.bottom ? r.top - box.bottom : box.top - r.bottom;
              if (gap < Math.max(3 * h, 0.5 * bh)) adjacentHidden = true;
            }
          }
        }
        return maxOut > 0 && (visible || adjacentHidden) ? { axis: 'y', overflow: Math.round(maxOut), hidden: Math.round(hidden) } : null;
      };

      for (const t of M.textNodes(document.body, 6000)) {
        const owner = t.parentElement;
        if (!M.isRendered(owner) || M.effectiveOpacity(owner) < 0.1) continue;
        const color = M.parseColor(M.style(owner).color);
        if (color && color[3] < 0.1) continue;
        const rects = M.textRects(t);
        if (!rects.length) continue;
        for (const c of [owner, ...M.clipChain(owner)]) {
          const s = M.style(c);
          if (s.display === 'inline' || s.display === 'contents') continue;
          const cx = M.clipsX(s);
          const cy = M.clipsY(s);
          if (!cx && !cy) continue;
          if (transformedBetween(owner, c)) break;
          const box = M.paddingBox(c);
          if (box.right - box.left <= 2 || box.bottom - box.top <= 2 || visuallyHidden(s)) break;
          let cut = null;
          if (cx && c.scrollWidth > c.clientWidth + 1) cut = horizontal(rects, box);
          if (!cut && cy && c.scrollHeight > c.clientHeight + 1) cut = vertical(rects, box);
          if (!cut) continue;
          let rec = found.get(c);
          if (!rec) {
            rec = { el: c, axes: new Set(), overflow: 0, hidden: 0, texts: [], ellipsis: false, clamp: false };
            found.set(c, rec);
          }
          rec.axes.add(cut.axis);
          rec.overflow = Math.max(rec.overflow, cut.overflow);
          rec.hidden += cut.hidden;
          const snip = M.snippet(t.nodeValue, 50);
          if (rec.texts.length < 3 && !rec.texts.includes(snip)) rec.texts.push(snip);
          if (cut.axis === 'x' && (s.textOverflow || '').includes('ellipsis')) rec.ellipsis = true;
          if (cut.axis === 'y' && M.isLineClamped(s)) rec.clamp = true;
          break;
        }
      }

      const fullTextHint = (el) => {
        for (let n = el, i = 0; n && i < 4 && n !== document.body; n = n.parentElement, i++) {
          if ((n.getAttribute('title') || '').trim() || (n.getAttribute('aria-label') || '').trim()) return true;
        }
        return !!el.querySelector('[title]');
      };

      const cutEls = new Set();
      for (const rec of found.values()) {
        const el = rec.el;
        const s = M.style(el);
        const sel = M.cssPath(el);
        const rect = M.round(M.visibleDocRect(el) || M.docRect(el));
        const axes = [...rec.axes];
        const quoted = rec.texts.map((x) => `"${x}"`).join(', ');
        const evidence = {
          texts: rec.texts,
          overflowPx: rec.overflow,
          hiddenPx: rec.hidden,
          axes,
          overflowX: s.overflowX,
          overflowY: s.overflowY,
          whiteSpace: s.whiteSpace,
          textOverflow: s.textOverflow,
          width: Math.round(el.getBoundingClientRect().width),
          height: Math.round(el.getBoundingClientRect().height),
        };
        if (rec.ellipsis || rec.clamp) {
          if (fullTextHint(el)) continue; // intentional truncation that exposes the full text
          issues.push({
            type: 'clipped-text',
            severity: 'warn',
            key: 'truncated',
            selector: sel,
            rect,
            message: `Text is truncated with ${rec.clamp ? 'line-clamp' : 'an ellipsis'} and the full text is not exposed (no title/aria-label): ${quoted}.`,
            evidence,
          });
        } else {
          cutEls.add(el);
          const how = axes.includes('x')
            ? `overflow-x: ${s.overflowX}, white-space: ${s.whiteSpace}`
            : `overflow-y: ${s.overflowY}, height: ${evidence.height}px`;
          issues.push({
            type: 'clipped-text',
            severity: 'error',
            key: 'cut',
            selector: sel,
            rect,
            message: `Text is cut off by \`${sel}\` (${how}): ${rec.hidden}px of ${quoted} ${rec.texts.length > 1 ? 'are' : 'is'} hidden${rec.axes.has('x') ? ' horizontally' : ''}.`,
            evidence,
          });
        }
      }

      // Short labels that wrap into a broken shape.
      const looksLikeButton = (a) => {
        const s = M.style(a);
        if (!/^(inline-block|block|flex|inline-flex|grid|inline-grid)$/.test(s.display)) return false;
        if (/\b(btn|button)\b/i.test(a.className || '')) return true;
        const bg = M.parseColor(s.backgroundColor);
        const border = parseFloat(s.borderTopWidth) >= 1 && (M.parseColor(s.borderTopColor) || [0, 0, 0, 0])[3] > 0.2;
        return ((bg && bg[3] > 0.2) || border) && parseFloat(s.paddingLeft) >= 6;
      };
      const countLines = (el) => {
        const centers = [];
        for (const t of M.textNodes(el, 50)) {
          for (const r of M.textRects(t)) centers.push({ c: r.top + r.height / 2, h: r.height });
        }
        centers.sort((a, b) => a.c - b.c);
        let lines = 0;
        let last = -Infinity;
        for (const p of centers) {
          if (p.c - last > p.h * 0.5) {
            lines++;
            last = p.c;
          }
        }
        return lines;
      };
      const candidates = document.querySelectorAll('button, [role="button"], a[href], label');
      for (const el of candidates) {
        if (M.inOverlay(el) || !M.isRendered(el) || M.effectiveOpacity(el) < 0.1) continue;
        if (cutEls.has(el) || [...cutEls].some((c) => c.contains(el) || el.contains(c))) continue;
        const tag = el.localName;
        let kind = 'button';
        if (tag === 'label') kind = 'label';
        else if (tag === 'a' && !looksLikeButton(el)) continue;
        const text = (el.innerText || '').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const words = text.split(' ').flatMap((w) => w.split(/(?<=[-/])/)).filter(Boolean);
        if (words.length > (kind === 'label' ? 6 : 8)) continue;
        const lines = countLines(el);
        const cjk = /[぀-ヿ㐀-鿿가-힯]/.test(text);
        const midWord = !cjk && lines > words.length;
        if (lines <= 2 && !midWord) continue;
        const sel = M.cssPath(el);
        const width = Math.round(el.getBoundingClientRect().width);
        issues.push({
          type: 'clipped-text',
          severity: 'warn',
          key: 'wrap',
          selector: sel,
          rect: M.round(M.docRect(el)),
          message: midWord
            ? `${kind === 'label' ? 'Label' : 'Button label'} "${M.snippet(text, 50)}" breaks inside a word (${lines} lines for ${words.length} word${words.length > 1 ? 's' : ''}); the control is ${width}px wide.`
            : `${kind === 'label' ? 'Label' : 'Button label'} "${M.snippet(text, 50)}" wraps onto ${lines} lines; the control is too narrow (${width}px) for this text.`,
          evidence: { text: M.snippet(text, 80), lines, words: words.length, width },
        });
      }
      return issues;
    });
  },
};
