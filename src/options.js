import { parseArgs } from 'node:util';

/** Raised for bad CLI input. The CLI prints the message and exits with code 2. */
export class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
  }
}

/**
 * @typedef {object} Viewport
 * @property {string} name
 * @property {number} width
 * @property {number} height
 * @property {boolean} isMobile  Chromium mobile emulation (meta viewport, touch, overflow zoom-out).
 * @property {boolean} hasTouch
 */

/** @type {Record<string, Viewport>} */
export const VIEWPORT_PRESETS = Object.freeze({
  mobile: { name: 'mobile', width: 360, height: 740, isMobile: true, hasTouch: true },
  tablet: { name: 'tablet', width: 768, height: 1024, isMobile: true, hasTouch: true },
  desktop: { name: 'desktop', width: 1440, height: 900, isMobile: false, hasTouch: false },
});

export const SCHEMES = Object.freeze(['light', 'dark']);

export const LOOK_DEFAULTS = Object.freeze({
  routes: null, // null = the path of the URL itself
  viewports: ['mobile', 'tablet', 'desktop'],
  schemes: ['light', 'dark'],
  locales: ['en'],
  darkStrategy: 'media',
  out: '.mantis',
  wait: 0,
  json: false,
  concurrency: 3,
  timeout: 30000,
});

/**
 * Parse one viewport token: a preset name (`mobile`), `WxH` (`390x844`) or `name=WxH` (`iphone=390x844`).
 * Custom viewports narrower than 1024px get mobile emulation.
 * @param {string} token
 * @returns {Viewport}
 */
export function parseViewport(token) {
  const t = String(token).trim();
  if (!t) throw new UsageError('empty viewport');
  if (Object.hasOwn(VIEWPORT_PRESETS, t)) return { ...VIEWPORT_PRESETS[t] };
  const m = t.match(/^(?:([a-z][\w-]*)=)?(\d{2,5})x(\d{2,5})$/i);
  if (!m) {
    throw new UsageError(`unknown viewport "${t}" (use ${Object.keys(VIEWPORT_PRESETS).join(', ')}, WxH or name=WxH)`);
  }
  const width = Number(m[2]);
  const height = Number(m[3]);
  if (width < 200 || height < 200 || width > 4000 || height > 4000) {
    throw new UsageError(`viewport "${t}" is out of range (200..4000 px)`);
  }
  const mobile = width < 1024;
  return { name: m[1] || `${width}x${height}`, width, height, isMobile: mobile, hasTouch: mobile };
}

/**
 * @typedef {{kind: 'media'} | {kind: 'class', name: string} | {kind: 'attr', name: string, value: string}} DarkStrategy
 */

/**
 * `media` | `class:<className>` | `attr:<attribute>=<value>` (value defaults to "dark").
 * @param {string} input
 * @returns {DarkStrategy}
 */
export function parseDarkStrategy(input) {
  const s = String(input ?? '').trim();
  if (s === '' || s === 'media') return { kind: 'media' };
  let m = s.match(/^class:([A-Za-z_-][\w-]*)$/);
  if (m) return { kind: 'class', name: m[1] };
  m = s.match(/^attr:([A-Za-z_:][\w:.-]*)(?:=(.+))?$/);
  if (m) return { kind: 'attr', name: m[1], value: m[2] ?? 'dark' };
  throw new UsageError(`invalid --dark-strategy "${s}" (use media, class:<name> or attr:<name>=<value>)`);
}

/** @param {DarkStrategy} d */
export function formatDarkStrategy(d) {
  if (d.kind === 'class') return `class:${d.name}`;
  if (d.kind === 'attr') return `attr:${d.name}=${d.value}`;
  return 'media';
}

/** Split a comma list, trim, drop empties and duplicates (order kept). */
export function splitList(value) {
  const out = [];
  for (const part of String(value ?? '').split(',')) {
    const t = part.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/**
 * Normalise routes: `settings` -> `/settings`; full URLs are reduced to path+query when same-origin.
 * @param {string[]} routes
 * @param {URL} base
 */
export function normalizeRoutes(routes, base) {
  const out = [];
  for (const r of routes) {
    let route;
    if (/^https?:\/\//i.test(r)) {
      const u = new URL(r);
      if (u.origin !== base.origin) throw new UsageError(`route "${r}" is on a different origin than ${base.origin}`);
      route = u.pathname + u.search;
    } else {
      route = r.startsWith('/') ? r : `/${r}`;
    }
    if (!out.includes(route)) out.push(route);
  }
  return out;
}

/**
 * File-name safe slug for a route: `/` -> `home`, `/settings/team?tab=2` -> `settings-team-tab-2`.
 * @param {string} route
 */
export function routeSlug(route) {
  const s = String(route)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.html?$/i, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return s || 'home';
}

function parseIntOpt(name, value, min, max) {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(String(value))) throw new UsageError(`--${name} must be a whole number (got "${value}")`);
  const n = Number(value);
  if (n < min || n > max) throw new UsageError(`--${name} must be between ${min} and ${max}`);
  return n;
}

const LOCALE_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

/**
 * @typedef {object} LookOptions
 * @property {string} url
 * @property {URL} baseUrl
 * @property {string[]} routes
 * @property {Viewport[]} viewports
 * @property {('light'|'dark')[]} schemes
 * @property {string[]} locales
 * @property {DarkStrategy} darkStrategy
 * @property {string} out
 * @property {number} wait
 * @property {boolean} json
 * @property {number} concurrency
 * @property {number} timeout
 * @property {string[]} ignore  CSS selectors excluded from every detector (plus [data-mantis-ignore]).
 */

/**
 * Parse `mantis look` arguments (everything after the sub-command).
 * @param {string[]} argv
 * @returns {LookOptions}
 */
export function parseLookArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        routes: { type: 'string' },
        viewports: { type: 'string' },
        schemes: { type: 'string' },
        locales: { type: 'string' },
        'dark-strategy': { type: 'string' },
        out: { type: 'string' },
        wait: { type: 'string' },
        json: { type: 'boolean' },
        concurrency: { type: 'string' },
        timeout: { type: 'string' },
        ignore: { type: 'string', multiple: true },
      },
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
  const { values, positionals } = parsed;
  if (positionals.length === 0) throw new UsageError('missing <url> (e.g. mantis look http://localhost:3000)');
  if (positionals.length > 1) throw new UsageError(`unexpected argument "${positionals[1]}"`);

  let raw = positionals[0];
  if (/^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:\d+)?(\/|$)/i.test(raw)) raw = `http://${raw}`;
  let baseUrl;
  try {
    baseUrl = new URL(raw);
  } catch {
    throw new UsageError(`invalid URL "${positionals[0]}"`);
  }
  if (!/^https?:$/.test(baseUrl.protocol)) throw new UsageError(`only http(s) URLs are supported (got ${baseUrl.protocol})`);

  const routes = values.routes !== undefined
    ? normalizeRoutes(splitList(values.routes), baseUrl)
    : [baseUrl.pathname + baseUrl.search];
  if (routes.length === 0) throw new UsageError('--routes is empty');

  const viewportTokens = values.viewports !== undefined ? splitList(values.viewports) : LOOK_DEFAULTS.viewports;
  if (viewportTokens.length === 0) throw new UsageError('--viewports is empty');
  const viewports = viewportTokens.map(parseViewport);
  const names = new Set();
  for (const v of viewports) {
    if (names.has(v.name)) throw new UsageError(`duplicate viewport name "${v.name}"`);
    names.add(v.name);
  }

  const schemes = values.schemes !== undefined ? splitList(values.schemes) : [...LOOK_DEFAULTS.schemes];
  if (schemes.length === 0) throw new UsageError('--schemes is empty');
  for (const s of schemes) {
    if (!SCHEMES.includes(s)) throw new UsageError(`unknown scheme "${s}" (use light, dark)`);
  }
  // Keep light before dark so theme-leak compares in a stable order.
  schemes.sort((a, b) => SCHEMES.indexOf(a) - SCHEMES.indexOf(b));

  const locales = values.locales !== undefined ? splitList(values.locales) : [...LOOK_DEFAULTS.locales];
  if (locales.length === 0) throw new UsageError('--locales is empty');
  for (const l of locales) {
    if (!LOCALE_RE.test(l)) throw new UsageError(`invalid locale "${l}" (use BCP 47 tags like en, vi, de-DE)`);
  }

  return {
    url: baseUrl.href,
    baseUrl,
    routes,
    viewports,
    schemes: /** @type {('light'|'dark')[]} */ (schemes),
    locales,
    darkStrategy: parseDarkStrategy(values['dark-strategy'] ?? LOOK_DEFAULTS.darkStrategy),
    out: values.out ?? LOOK_DEFAULTS.out,
    wait: parseIntOpt('wait', values.wait, 0, 120000) ?? LOOK_DEFAULTS.wait,
    json: Boolean(values.json),
    concurrency: parseIntOpt('concurrency', values.concurrency, 1, 16) ?? LOOK_DEFAULTS.concurrency,
    timeout: parseIntOpt('timeout', values.timeout, 1000, 600000) ?? LOOK_DEFAULTS.timeout,
    ignore: (values.ignore ?? []).map((s) => s.trim()).filter(Boolean),
  };
}

/**
 * @typedef {object} ProofOptions
 * @property {string|null} before
 * @property {string|null} after
 * @property {string} out
 * @property {boolean} video
 * @property {string|null} beforeUrl
 * @property {string|null} afterUrl
 * @property {Viewport} viewport
 * @property {DarkStrategy} darkStrategy
 * @property {string} videoOut
 */

/**
 * Parse `mantis proof` arguments.
 * @param {string[]} argv
 * @returns {ProofOptions}
 */
export function parseProofArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: false,
      strict: true,
      options: {
        before: { type: 'string' },
        after: { type: 'string' },
        out: { type: 'string' },
        video: { type: 'boolean' },
        'before-url': { type: 'string' },
        'after-url': { type: 'string' },
        viewport: { type: 'string' },
        'dark-strategy': { type: 'string' },
      },
    });
  } catch (err) {
    throw new UsageError(err.message);
  }
  const v = parsed.values;
  const before = v.before ?? null;
  const after = v.after ?? null;
  if ((before === null) !== (after === null)) throw new UsageError('--before and --after must be given together');
  const video = Boolean(v.video);
  if (!video && before === null) throw new UsageError('nothing to do: pass --before <runDir> --after <runDir> and/or --video');
  if (video && (!v['before-url'] || !v['after-url'])) throw new UsageError('--video needs --before-url <url> and --after-url <url>');
  for (const key of ['before-url', 'after-url']) {
    if (v[key]) {
      try {
        const u = new URL(v[key]);
        if (!/^https?:$/.test(u.protocol)) throw new Error('protocol');
      } catch {
        throw new UsageError(`--${key} must be an http(s) URL`);
      }
    }
  }
  const out = v.out ?? '.mantis/proof.png';
  if (!/\.png$/i.test(out)) throw new UsageError('--out must end in .png');
  return {
    before,
    after,
    out,
    video,
    beforeUrl: v['before-url'] ?? null,
    afterUrl: v['after-url'] ?? null,
    viewport: parseViewport(v.viewport ?? 'mobile'),
    darkStrategy: parseDarkStrategy(v['dark-strategy'] ?? 'media'),
    videoOut: out.replace(/\.png$/i, '.mp4'),
  };
}
