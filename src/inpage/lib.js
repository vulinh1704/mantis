/**
 * In-page helper library, installed as `window.__mantis` before detectors run.
 *
 * This function is serialized with Function.prototype.toString() and evaluated in the page,
 * so it must stay fully self-contained (no imports, no references to module scope).
 * All rects returned by the helpers named `doc*` are in document coordinates (CSS px from the
 * top-left of the page), which is what annotations and full-page screenshots use.
 */
export function installMantisLib(options = {}) {
  const ignoreSelector = ['[data-mantis-ignore]', ...(options.ignore || [])].join(', ');
  if (window.__mantis && window.__mantis.v === 4 && window.__mantis.ignoreSelector === ignoreSelector) return true;

  const SKIP_TEXT_PARENTS = new Set([
    'script', 'style', 'noscript', 'template', 'title', 'option', 'optgroup', 'select',
    'textarea', 'datalist', 'iframe', 'object', 'canvas', 'video', 'audio', 'head',
  ]);
  const REPLACED = new Set(['img', 'video', 'canvas', 'svg', 'iframe', 'picture', 'object', 'embed']);
  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"]';
  const TARGETS = INTERACTIVE + ', summary, [role="link"], [role="checkbox"], [role="radio"], [role="switch"], [role="tab"], [role="menuitem"]';

  let styleCache = new Map();
  let opacityCache = new Map();
  let layerCache = new Map();
  const colorCache = new Map();
  let canvasCtx = null;

  function reset() {
    styleCache = new Map();
    opacityCache = new Map();
    layerCache = new Map();
  }

  function style(el) {
    let s = styleCache.get(el);
    if (!s) {
      s = getComputedStyle(el);
      styleCache.set(el, s);
    }
    return s;
  }

  function inOverlay(el) {
    return !!(el && el.closest && el.closest('[data-mantis-overlay]'));
  }

  /** Excluded by the page (data-mantis-ignore) or the user (--ignore), or Mantis' own overlay. */
  function ignored(el) {
    if (!el || !el.closest) return false;
    if (inOverlay(el)) return true;
    try {
      return !!el.closest(ignoreSelector);
    } catch {
      return !!el.closest('[data-mantis-ignore]');
    }
  }

  /** Inside an aria-hidden="true" subtree: declared decorative by the page. */
  function ariaHidden(el) {
    return !!(el && el.closest && el.closest('[aria-hidden="true"]'));
  }

  /** Entirely outside the page (e.g. a skip link parked at left:-9999px or left:100%). */
  function offscreen(el) {
    const r = el.getBoundingClientRect();
    if (layerKind(el) === 'fixed') return r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight;
    const html = document.documentElement;
    const W = Math.max(html.scrollWidth, document.body ? document.body.scrollWidth : 0);
    const H = Math.max(html.scrollHeight, document.body ? document.body.scrollHeight : 0);
    const x = r.left + scrollX;
    const y = r.top + scrollY;
    return x + r.width <= 0 || y + r.height <= 0 || x >= W || y >= H;
  }

  /** Element is rendered, not hidden by display/visibility/opacity/content-visibility, and has a box. */
  function isRendered(el) {
    if (!el || !el.isConnected) return false;
    if (typeof el.checkVisibility === 'function') {
      const ok = el.checkVisibility({
        opacityProperty: true,
        visibilityProperty: true,
        checkOpacity: true,
        checkVisibilityCSS: true,
        contentVisibilityAuto: true,
      });
      if (!ok) return false;
    } else {
      const s = style(el);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function effectiveOpacity(el) {
    if (opacityCache.has(el)) return opacityCache.get(el);
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      o *= parseFloat(style(n).opacity);
      if (!(o > 0.001)) {
        o = 0;
        break;
      }
    }
    opacityCache.set(el, o);
    return o;
  }

  /** 'fixed' | 'sticky' | 'flow' — the positioning layer an element lives in. */
  function layerKind(el) {
    if (layerCache.has(el)) return layerCache.get(el);
    let kind = 'flow';
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const p = style(n).position;
      if (p === 'fixed') {
        kind = 'fixed';
        break;
      }
      if (p === 'sticky') kind = 'sticky';
    }
    layerCache.set(el, kind);
    return kind;
  }

  // ---------- colors ----------

  /** Parse any CSS color to [r, g, b, a] in sRGB (0-255, alpha 0-1). */
  function parseColor(str) {
    if (!str) return null;
    const hit = colorCache.get(str);
    if (hit) return hit;
    let out = null;
    const m = str.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/i);
    if (m) {
      let a = m[4] === undefined ? 1 : parseFloat(m[4]);
      if (m[5] === '%') a /= 100;
      out = [Number(m[1]), Number(m[2]), Number(m[3]), a];
    } else if (str === 'transparent') {
      out = [0, 0, 0, 0];
    } else {
      // oklch(), lab(), color(display-p3 ...) etc: let the browser convert by painting one pixel.
      if (!canvasCtx) {
        const c = document.createElement('canvas');
        c.width = 1;
        c.height = 1;
        canvasCtx = c.getContext('2d', { willReadFrequently: true });
      }
      canvasCtx.clearRect(0, 0, 1, 1);
      canvasCtx.fillStyle = '#000';
      canvasCtx.fillStyle = str;
      canvasCtx.fillRect(0, 0, 1, 1);
      const d = canvasCtx.getImageData(0, 0, 1, 1).data;
      out = [d[0], d[1], d[2], d[3] / 255];
    }
    colorCache.set(str, out);
    return out;
  }

  function blend(top, bottom) {
    const a = top[3] === undefined ? 1 : top[3];
    return [
      top[0] * a + bottom[0] * (1 - a),
      top[1] * a + bottom[1] * (1 - a),
      top[2] * a + bottom[2] * (1 - a),
      1,
    ];
  }

  function canvasColor() {
    const probe = document.createElement('div');
    probe.setAttribute('data-mantis-overlay', '');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;background-color:Canvas;color:CanvasText';
    document.documentElement.appendChild(probe);
    const c = parseColor(getComputedStyle(probe).backgroundColor) || [255, 255, 255, 1];
    probe.remove();
    return c[3] > 0 ? [c[0], c[1], c[2], 1] : [255, 255, 255, 1];
  }

  /** Color of the page canvas (html background, else body background, else the UA canvas color). */
  function pageBackground() {
    const canvas = canvasColor();
    let c = parseColor(style(document.documentElement).backgroundColor);
    if ((!c || c[3] === 0) && document.body) c = parseColor(style(document.body).backgroundColor);
    if (!c || c[3] === 0) return canvas.slice(0, 3);
    return blend(c, canvas).slice(0, 3);
  }

  /**
   * The solid color painted behind an element, from its own and its ancestors' background colors.
   * Returns null when unknown (a background image or gradient is involved, or the element is
   * positioned outside the ancestor that provides the color).
   */
  function effectiveBackground(el) {
    const layers = [];
    const r = el.getBoundingClientRect();
    let base = null;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const s = style(n);
      if (s.backgroundImage && s.backgroundImage !== 'none') return null;
      const c = parseColor(s.backgroundColor);
      if (c && c[3] > 0) {
        if (n !== el && n !== document.body && n !== document.documentElement) {
          const nr = n.getBoundingClientRect();
          if (r.left < nr.left - 2 || r.top < nr.top - 2 || r.right > nr.right + 2 || r.bottom > nr.bottom + 2) return null;
        }
        if (c[3] >= 0.999) {
          base = c;
          break;
        }
        layers.push(c);
      }
    }
    if (!base) base = [...pageBackground(), 1];
    for (let i = layers.length - 1; i >= 0; i--) base = blend(layers[i], base);
    return [Math.round(base[0]), Math.round(base[1]), Math.round(base[2])];
  }

  // ---------- geometry ----------

  function docRect(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height };
  }

  function toDoc(r) {
    return { x: r.left + scrollX, y: r.top + scrollY, width: r.right - r.left, height: r.bottom - r.top };
  }

  function round(r) {
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  }

  /** Padding box in viewport coordinates (the area overflow clipping applies to). */
  function paddingBox(n) {
    const r = n.getBoundingClientRect();
    const left = r.left + n.clientLeft;
    const top = r.top + n.clientTop;
    return { left, top, right: left + n.clientWidth, bottom: top + n.clientHeight };
  }

  function clipsX(s) {
    return s.overflowX === 'hidden' || s.overflowX === 'clip';
  }
  function clipsY(s) {
    return s.overflowY === 'hidden' || s.overflowY === 'clip';
  }
  function hasOverflowClip(s) {
    return s.overflowX !== 'visible' || s.overflowY !== 'visible' || /paint|strict|content/.test(s.contain || '');
  }
  function isLineClamped(s) {
    const v = s.webkitLineClamp || s.getPropertyValue('-webkit-line-clamp');
    return !!v && v !== 'none';
  }

  function establishesAbsCB(s) {
    return s.position !== 'static' || establishesFixedCB(s);
  }
  function establishesFixedCB(s) {
    return (s.transform && s.transform !== 'none') ||
      (s.translate && s.translate !== 'none') ||
      (s.scale && s.scale !== 'none') ||
      (s.rotate && s.rotate !== 'none') ||
      (s.filter && s.filter !== 'none') ||
      (s.perspective && s.perspective !== 'none') ||
      (s.backdropFilter && s.backdropFilter !== 'none') ||
      /paint|layout|strict|content/.test(s.contain || '') ||
      /transform|filter|perspective/.test(s.willChange || '');
  }

  /**
   * Ancestors (below <body>) whose overflow clipping applies to `el`, nearest first.
   * Respects the containing-block chain: an absolutely positioned element is not clipped by a
   * static overflow:hidden ancestor that sits between it and its containing block.
   */
  function clipChain(el) {
    const out = [];
    const pos = style(el).position;
    let mode = pos === 'absolute' ? 'abs' : pos === 'fixed' ? 'fixed' : 'flow';
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      const s = style(n);
      const inChain = mode === 'flow' || (mode === 'abs' ? establishesAbsCB(s) : establishesFixedCB(s));
      if (!inChain) continue;
      if (s.display !== 'inline' && s.display !== 'contents' && hasOverflowClip(s)) out.push(n);
      mode = s.position === 'absolute' ? 'abs' : s.position === 'fixed' ? 'fixed' : 'flow';
    }
    return out;
  }

  /** Viewport-coordinate rect of what is actually visible of `r` after `el`'s clipping ancestors. */
  function clipViewportRect(el, r) {
    let left = r.left;
    let top = r.top;
    let right = r.right;
    let bottom = r.bottom;
    for (const c of clipChain(el)) {
      const s = style(c);
      const b = paddingBox(c);
      if (s.overflowX !== 'visible' || /paint|strict|content/.test(s.contain || '')) {
        left = Math.max(left, b.left);
        right = Math.min(right, b.right);
      }
      if (s.overflowY !== 'visible' || /paint|strict|content/.test(s.contain || '')) {
        top = Math.max(top, b.top);
        bottom = Math.min(bottom, b.bottom);
      }
      if (right - left <= 0 || bottom - top <= 0) return null;
    }
    return { left, top, right, bottom };
  }

  /** Visible rect of an element in document coordinates, or null when fully clipped. */
  function visibleDocRect(el) {
    const r = clipViewportRect(el, el.getBoundingClientRect());
    return r ? toDoc(r) : null;
  }

  /** The .sr-only / visually-hidden pattern: a <= 2px box, clip: rect(0 0 0 0) or clip-path: inset(50%). */
  function visuallyHidden(el) {
    const s = style(el);
    const clip = s.clip || '';
    if (/rect\(\s*0(px)?[\s,]+0(px)?[\s,]+0(px)?[\s,]+0(px)?\s*\)/.test(clip)) return true;
    if (/inset\(\s*(50%|100%)/.test(s.clipPath || '')) return true;
    if (s.display === 'inline' || s.display === 'contents') return false;
    const r = el.getBoundingClientRect();
    return (r.width <= 2 || r.height <= 2) && (s.overflowX !== 'visible' || s.overflowY !== 'visible');
  }

  /**
   * Visible part of a text fragment rect (viewport coords): clipped by the text's own element when
   * that element clips its overflow, then by its clipping ancestors.
   */
  function clipTextRect(owner, r) {
    let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    const s = style(owner);
    if (s.display !== 'inline' && s.display !== 'contents') {
      const p = paddingBox(owner);
      if (s.overflowX !== 'visible') {
        box.left = Math.max(box.left, p.left);
        box.right = Math.min(box.right, p.right);
      }
      if (s.overflowY !== 'visible') {
        box.top = Math.max(box.top, p.top);
        box.bottom = Math.min(box.bottom, p.bottom);
      }
      if (box.right - box.left <= 0 || box.bottom - box.top <= 0) return null;
    }
    return clipViewportRect(owner, box);
  }

  const range = document.createRange();
  /** Client rects of a text node's line fragments (viewport coordinates). */
  function textRects(node) {
    range.selectNodeContents(node);
    const out = [];
    for (const r of range.getClientRects()) {
      if (r.width > 0.5 && r.height > 0.5) out.push(r);
    }
    return out;
  }

  /**
   * Does `el` itself put visible pixels at viewport point (x, y)? True for replaced content and
   * SVG, a background (color with alpha >= 0.3, or an image/gradient), its own text under the
   * point, or a visible border when the point is on it. Transparent padding is not painting.
   */
  function paintsAt(el, x, y) {
    if (el instanceof SVGElement) return true;
    if (REPLACED.has(el.localName)) return true;
    const s = style(el);
    if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    const bg = parseColor(s.backgroundColor);
    if (bg && bg[3] >= 0.3) return true;
    for (const c of el.childNodes) {
      if (c.nodeType === 3 && c.nodeValue.trim()) {
        for (const r of textRects(c)) {
          if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
        }
      }
    }
    const r = el.getBoundingClientRect();
    const edge = (side, px) => {
      const w = parseFloat(s[`border${side}Width`]) || 0;
      const col = parseColor(s[`border${side}Color`]);
      return w >= 1 && col && col[3] >= 0.3 && px <= w + 1;
    };
    return edge('Left', x - r.left) || edge('Right', r.right - x) || edge('Top', y - r.top) || edge('Bottom', r.bottom - y);
  }

  function hasOwnText(el) {
    for (const c of el.childNodes) {
      if (c.nodeType === 3 && c.nodeValue.trim() && textRects(c).length) return true;
    }
    return false;
  }

  function skipTextParent(el) {
    if (!el) return true;
    const tag = el.localName;
    if (SKIP_TEXT_PARENTS.has(tag)) return true;
    if (el instanceof SVGElement) return true;
    return ignored(el);
  }

  /** All non-empty text nodes under root, with an element parent that can render text. */
  function textNodes(root, max) {
    const out = [];
    if (!root) return out;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.nodeValue || !t.nodeValue.trim()) continue;
      if (skipTextParent(t.parentElement)) continue;
      out.push(t);
      if (out.length >= max) break;
    }
    return out;
  }

  function snippet(text, n = 60) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '…' : t;
  }

  // ---------- selectors ----------

  function uniq(sel) {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  }

  function isStableId(id) {
    return /^[A-Za-z][\w-]{0,63}$/.test(id) && !/\d{4,}/.test(id) && !/^(ember|react-|radix-|headlessui-|mui-|rc-|r[0-9])/i.test(id);
  }

  function goodClass(c) {
    return /^[A-Za-z][A-Za-z0-9_-]{0,40}$/.test(c) && !/\d{3,}/.test(c) && !/^(css|sc|jsx|emotion|svelte|astro|tw)-/i.test(c) && !/__[A-Za-z0-9]{5,}$/.test(c);
  }

  function anchorSelector(el) {
    if (el.id && isStableId(el.id)) {
      const s = '#' + CSS.escape(el.id);
      if (uniq(s)) return s;
    }
    for (const attr of ['data-testid', 'data-test', 'data-cy']) {
      const v = el.getAttribute(attr);
      if (v && v.length < 80) {
        const s = `[${attr}="${v.replace(/["\\]/g, '\\$&')}"]`;
        if (uniq(s)) return s;
      }
    }
    return null;
  }

  function segment(el) {
    let seg = el.localName;
    const classes = [...el.classList].filter(goodClass).slice(0, 2);
    if (classes.length) seg += classes.map((c) => '.' + CSS.escape(c)).join('');
    const parent = el.parentElement;
    if (parent) {
      let clash = false;
      for (const c of parent.children) {
        if (c !== el) {
          try {
            if (c.matches(seg)) {
              clash = true;
              break;
            }
          } catch {
            clash = true;
            break;
          }
        }
      }
      if (clash) {
        let i = 0;
        for (const c of parent.children) {
          if (c.localName === el.localName) i++;
          if (c === el) break;
        }
        seg += `:nth-of-type(${i})`;
      }
    }
    return seg;
  }

  /** Short, readable, unique CSS selector, anchored on the nearest id / data-testid ancestor. */
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el === document.documentElement) return 'html';
    if (el === document.body) return 'body';
    const own = anchorSelector(el);
    if (own) return own;
    const chain = [];
    let anchor = null;
    for (let n = el; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      if (n !== el) {
        const a = anchorSelector(n);
        if (a) {
          anchor = a;
          break;
        }
      }
      chain.push(n);
    }
    const segs = chain.map(segment);
    const prefix = anchor ? anchor + ' ' : '';
    for (let k = 1; k <= segs.length; k++) {
      const sel = prefix + segs.slice(0, k).reverse().join(' > ');
      if (uniq(sel)) return sel;
    }
    const full = (anchor ? anchor + ' > ' : 'body > ') + segs.slice().reverse().join(' > ');
    return full;
  }

  /** Structural key (child-index path) used to match the same element across light/dark cells. */
  const keyCache = new WeakMap();
  function structKey(el) {
    if (!el || el.nodeType !== 1) return '';
    const hit = keyCache.get(el);
    if (hit) return hit;
    let key;
    if (el === document.documentElement) key = 'html';
    else {
      const parent = el.parentElement;
      let i = 0;
      if (parent) {
        for (const c of parent.children) {
          if (c === el) break;
          i++;
        }
      }
      key = structKey(parent) + '/' + el.localName + '[' + i + ']';
    }
    keyCache.set(el, key);
    return key;
  }

  function byStructKey(key) {
    const parts = key.split('/');
    let el = document.documentElement;
    for (let p = 1; p < parts.length && el; p++) {
      const m = parts[p].match(/^(.*)\[(\d+)\]$/);
      if (!m) return null;
      const c = el.children[Number(m[2])];
      if (!c || c.localName !== m[1]) return null;
      el = c;
    }
    return el;
  }

  function signature(el) {
    return el.localName + (el.id ? '#' + el.id : '') + '.' + [...el.classList].sort().join('.');
  }

  window.__mantis = {
    v: 4,
    ignoreSelector,
    INTERACTIVE,
    TARGETS,
    REPLACED,
    reset,
    style,
    inOverlay,
    ignored,
    ariaHidden,
    offscreen,
    isRendered,
    effectiveOpacity,
    layerKind,
    parseColor,
    blend,
    pageBackground,
    effectiveBackground,
    docRect,
    toDoc,
    round,
    paddingBox,
    clipsX,
    clipsY,
    isLineClamped,
    clipChain,
    clipViewportRect,
    visibleDocRect,
    visuallyHidden,
    clipTextRect,
    paintsAt,
    textRects,
    hasOwnText,
    skipTextParent,
    textNodes,
    snippet,
    cssPath,
    structKey,
    byStructKey,
    signature,
  };
  return true;
}
