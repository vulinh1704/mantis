/**
 * House style: what `mantis learn` measures on the running app, and how `look` checks a page
 * against it (the off-style detector).
 *
 * style.json keeps, per value, how often the app uses it, in which roles, the CSS custom
 * properties that resolve to it, and a few example elements. Colors are kept per scheme. A
 * near-duplicate is a rarely used value without a token of its own that is almost the same as a
 * common one (a color within ΔE2000 3, a font size within 0.5px, a radius within 1px): usually a
 * hard-coded copy of a token.
 */
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { hexDistance } from './color.js';
import { UsageError } from './options.js';

/** Value kinds of style.json, in the order reports show them. */
export const STYLE_KINDS = ['fontSize', 'fontFamily', 'fontWeight', 'radius', 'spacing', 'shadow', 'duration', 'easing'];

// Real type scales step by 1px (12, 13, 14…), so a near-duplicate size is a fraction of a pixel off.
const LEARN_NEAR = { color: 3, fontSize: 0.5, radius: 1 };
const LOOK_NEAR = { color: 5, fontSize: 2, radius: 4 };
const MAIN_USES = 3; // a value used this often (in all screens together) is part of the house style
const RARE_USES = 2; // a value on at most this many elements of any one screen can be a near-duplicate

// Which length tokens name which kind of value (Tailwind, shadcn/ui, Open Props and hand-rolled names).
const LENGTH_TOKEN = {
  fontSize: /text|font-?size|fs-|type|heading/i,
  radius: /radius|rounded|round|corner/i,
  spacing: /space|spacing|gap|pad|margin|gutter|inset|size-\d/i,
};

const byValue = (a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const byUses = (a, b) => b.uses - a.uses || byValue(a.value, b.value);

function mergeInto(map, groups = [], where) {
  for (const g of groups) {
    let e = map.get(g.value);
    if (!e) map.set(g.value, (e = { value: g.value, uses: 0, perScreen: 0, roles: {}, examples: [] }));
    e.uses += g.uses;
    e.perScreen = Math.max(e.perScreen, g.uses);
    for (const [role, n] of Object.entries(g.roles || {})) e.roles[role] = (e.roles[role] || 0) + n;
    for (const ex of g.examples || []) {
      if (e.examples.length < 3 && !e.examples.some((x) => x.sel === ex.sel)) e.examples.push({ sel: ex.sel, text: ex.text, ...where });
    }
  }
}

const finish = (map, tokensFor) =>
  [...map.values()].sort(byUses).map((e) => {
    const out = { value: e.value, uses: e.uses, perScreen: e.perScreen };
    if (Object.keys(e.roles).length) out.roles = e.roles;
    const tokens = tokensFor(e.value);
    if (tokens.length) out.tokens = tokens;
    out.examples = e.examples;
    return out;
  });

/**
 * Merge the per-cell collections into the house style.
 * @param {{route: string, viewport: string, scheme: string, data: object}[]} cells
 */
export function buildStyle(cells, { url, routes, viewports, schemes, storageState = null, version, learnedAt = new Date() }) {
  const colorMaps = Object.fromEntries(schemes.map((s) => [s, new Map()]));
  const maps = Object.fromEntries(STYLE_KINDS.map((k) => [k, new Map()]));
  const tokens = Object.fromEntries(schemes.map((s) => [s, {}]));
  let elements = 0;
  let sheetsSkipped = 0;
  for (const c of cells) {
    const where = { route: c.route, cell: `${c.viewport}/${c.scheme}` };
    elements += c.data.elements;
    sheetsSkipped = Math.max(sheetsSkipped, c.data.sheetsSkipped || 0);
    mergeInto(colorMaps[c.scheme], c.data.groups.color, where);
    for (const k of STYLE_KINDS) mergeInto(maps[k], c.data.groups[k], where);
    Object.assign(tokens[c.scheme], c.data.tokens);
  }
  const allTokens = Object.assign({}, ...schemes.map((s) => tokens[s]));
  const names = (pred) => Object.entries(allTokens).filter(([, t]) => pred(t)).map(([n]) => n).sort();
  const style = {
    tool: 'mantis',
    kind: 'style',
    version,
    learnedAt: learnedAt.toISOString(),
    url,
    routes,
    viewports,
    schemes,
    storageState,
    screens: cells.length,
    elements,
    colors: Object.fromEntries(schemes.map((s) => [s, finish(colorMaps[s], (v) =>
      Object.entries(tokens[s]).filter(([, t]) => t.kind === 'color' && t.value === v).map(([n]) => n).sort())])),
  };
  for (const k of STYLE_KINDS) {
    style[k] = finish(maps[k], (v) => {
      if (k in LENGTH_TOKEN) return names((t) => t.kind === 'length' && t.value === v).filter((n) => LENGTH_TOKEN[k].test(n));
      if (k === 'duration') return names((t) => t.kind === 'duration' && t.value === v);
      if (k === 'easing') return names((t) => t.kind === 'easing' && t.value === v);
      if (k === 'shadow') return names((t) => t.kind === 'shadow' && t.value === v);
      if (k === 'fontFamily') return names((t) => t.kind === 'font' && t.value === v);
      return [];
    });
  }
  style.tokens = tokens;
  style.drift = findDrift(style);
  style.notes = sheetsSkipped ? [`${sheetsSkipped} cross-origin style sheet(s) could not be read for tokens.`] : [];
  return style;
}

function nearest(value, entries, distance, limit) {
  let best = null;
  for (const e of entries) {
    if (e.value === value) continue;
    const d = distance(value, e.value);
    if (d <= limit && (!best || d < best.d || (d === best.d && e.uses > best.entry.uses))) best = { entry: e, d };
  }
  return best;
}

/** The nearest house value, preferring the common ones over rare copies. */
const nearestHouse = (value, entries, distance, limit) =>
  nearest(value, entries.filter((e) => e.uses >= MAIN_USES), distance, limit) || nearest(value, entries, distance, limit);

const numeric = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) : Infinity);

/** Rare values that are almost a common one: likely hard-coded copies of a house value. */
export function findDrift(style) {
  const drift = [];
  const check = (kind, scheme, entries, distance, limit) => {
    // House values: a token, or used on several elements of one screen. Rare: no token, and on
    // at most RARE_USES elements of any screen (an element repeated on every screen is still rare).
    const main = entries.filter((e) => e.tokens?.length || e.perScreen >= MAIN_USES);
    for (const e of entries) {
      if (e.perScreen > RARE_USES || e.tokens?.length) continue;
      const n = nearest(e.value, main.filter((m) => m.uses >= 3 * e.uses), distance, limit);
      if (!n) continue;
      drift.push({
        kind,
        ...(scheme ? { scheme } : {}),
        value: e.value,
        uses: e.uses,
        near: n.entry.value,
        nearUses: n.entry.uses,
        nearTokens: n.entry.tokens || [],
        distance: Math.round(n.d * 100) / 100,
        examples: e.examples,
      });
    }
  };
  for (const scheme of style.schemes) check('color', scheme, style.colors[scheme] || [], hexDistance, LEARN_NEAR.color);
  check('fontSize', null, style.fontSize || [], numeric, LEARN_NEAR.fontSize);
  check('radius', null, style.radius || [], numeric, LEARN_NEAR.radius);
  return drift.sort((a, b) => a.distance - b.distance);
}

/**
 * The house style `look` checks against: `none`, a style.json path, or `auto` = `<out>/style.json`
 * when it exists.
 * @param {{style?: string, out: string}} opts
 */
export async function loadStyle(opts) {
  const choice = opts.style ?? 'auto';
  if (choice === 'none') return null;
  const file = choice === 'auto' ? path.resolve(opts.out, 'style.json') : path.resolve(choice);
  if (!existsSync(file)) {
    if (choice === 'auto') return null;
    throw new UsageError(`--style: no such file ${choice} (make one with mantis learn <url>)`);
  }
  let style;
  try {
    style = JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    throw new UsageError(`--style: cannot read ${file}: ${err.message.split('\n')[0]}`);
  }
  if (style?.tool !== 'mantis' || style.kind !== 'style') throw new UsageError(`--style: ${file} is not a Mantis style.json (made by mantis learn)`);
  return { ...style, file };
}

const fmtValue = (kind, v) => (typeof v === 'number' && kind !== 'fontWeight' ? `${v}px` : String(v));
const tokenOf = (e) => (e?.tokens?.length ? ` (\`${e.tokens[0]}\`)` : '');
const roleText = (roles = {}) => {
  const r = Object.keys(roles).sort((a, b) => roles[b] - roles[a]);
  return r.length ? r.map((x) => (x === 'bg' ? 'background' : x)).join(', ') : 'color';
};
const scale = (entries) => entries.filter((e) => e.uses >= MAIN_USES).map((e) => e.value).sort((a, b) => (typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))));

/**
 * Off-style issues for one cell: values the page uses that are not in the house style but sit
 * close to a house value (a near copy), and font families the app does not use anywhere else.
 * Values far from every house value are left alone: a new illustration color or a display size
 * may well be on purpose.
 * @param {object} style  loaded style.json
 * @param {'light'|'dark'} scheme
 * @param {{groups: Record<string, object[]>}} data  collectStyle() of the cell
 */
export function offStyleIssues(style, scheme, data) {
  const issues = [];
  const push = (kind, g, message, evidence) => {
    const ex = g.examples || [];
    issues.push({
      type: 'off-style',
      severity: 'warn',
      dedupeKey: `off-style:${kind}:${g.value}`,
      selector: ex[0]?.sel ?? null,
      rect: ex[0]?.rect ?? null,
      extraRects: ex.slice(1).map((e) => e.rect).filter(Boolean),
      message,
      evidence: { kind, value: g.value, count: g.uses, selectors: ex.map((e) => e.sel), ...evidence },
    });
  };
  const eg = (g) => {
    const t = (g.examples || []).map((e) => e.text).find(Boolean);
    return `${g.uses} element${g.uses === 1 ? '' : 's'}${t ? `, e.g. "${t}"` : ''}`;
  };

  const palette = style.colors?.[scheme] || [];
  if (palette.length) {
    const known = new Set(palette.map((e) => e.value));
    for (const g of data.groups.color || []) {
      if (known.has(g.value)) continue;
      const n = nearestHouse(g.value, palette, hexDistance, LOOK_NEAR.color);
      if (!n) continue;
      push('color', g,
        `Off-palette ${roleText(g.roles)} color ${g.value} on ${eg(g)}: ΔE ${n.d.toFixed(1)} from the house color ${n.entry.value}${tokenOf(n.entry)}, used ${n.entry.uses}×. Use that color instead of a near copy.`,
        { near: n.entry.value, nearTokens: n.entry.tokens || [], nearUses: n.entry.uses, distance: Math.round(n.d * 100) / 100, roles: g.roles, scheme });
    }
  }
  for (const [kind, label] of [['fontSize', 'Font size'], ['radius', 'Corner radius']]) {
    const entries = style[kind] || [];
    if (!entries.length) continue;
    const known = new Set(entries.map((e) => e.value));
    for (const g of data.groups[kind] || []) {
      if (known.has(g.value)) continue;
      const n = nearestHouse(g.value, entries, numeric, LOOK_NEAR[kind]);
      if (!n) continue;
      const s = scale(entries);
      push(kind, g,
        `${label} ${fmtValue(kind, g.value)} on ${eg(g)} is not in the house style${s.length ? ` (${s.map((v) => fmtValue(kind, v)).join(', ')})` : ''}; the nearest is ${fmtValue(kind, n.entry.value)}${tokenOf(n.entry)}, used ${n.entry.uses}×.`,
        { near: n.entry.value, nearTokens: n.entry.tokens || [], nearUses: n.entry.uses, distance: n.d });
    }
  }
  const families = style.fontFamily || [];
  if (families.length) {
    const known = new Set(families.map((e) => String(e.value).toLowerCase()));
    for (const g of data.groups.fontFamily || []) {
      if (known.has(String(g.value).toLowerCase())) continue;
      push('fontFamily', g, `Font "${g.value}" on ${eg(g)} is not one of the app's fonts (${families.slice(0, 4).map((e) => `"${e.value}"`).join(', ')}).`,
        { houseFonts: families.map((e) => e.value) });
    }
  }
  return issues;
}

/** One line per kind, e.g. "18 colors (light) · 17 colors (dark) · 7 font sizes · …". */
export function styleCounts(style) {
  const parts = style.schemes.map((s) => `${style.colors[s]?.length ?? 0} colors${style.schemes.length > 1 ? ` (${s})` : ''}`);
  const n = (k, word) => `${(style[k] || []).length} ${word}`;
  const one = { 'font sizes': 'font size', fonts: 'font', radii: 'radius', 'spacing values': 'spacing value', durations: 'duration' };
  const n2 = (k, word) => ((style[k] || []).length === 1 && one[word] ? `1 ${one[word]}` : n(k, word));
  parts.push(n2('fontSize', 'font sizes'), n2('fontFamily', 'fonts'), n2('radius', 'radii'), n2('spacing', 'spacing values'), n2('duration', 'durations'));
  return parts.join(' · ');
}

/** style.md: the house style as a readable reference. */
export function renderStyleMarkdown(style) {
  const lines = ['# House style', ''];
  lines.push(`Learned by Mantis ${style.version} from \`${style.url}\` on ${style.learnedAt.slice(0, 10)}: ${style.screens} screens (${style.routes.length} route${style.routes.length === 1 ? '' : 's'} × ${style.viewports.join(', ')} × ${style.schemes.join(', ')}), ${style.elements} visible elements${style.storageState ? `, session \`${style.storageState}\`` : ''}.`, '');
  lines.push(styleCounts(style), '');
  const tok = (e) => (e.tokens?.length ? e.tokens.map((t) => `\`${t}\``).join(' ') : '');
  for (const s of style.schemes) {
    const colors = style.colors[s] || [];
    lines.push(`## Colors · ${s} (${colors.length})`, '', '| color | uses | text | background | border | tokens |', '|---|---|---|---|---|---|');
    for (const e of colors) lines.push(`| \`${e.value}\` | ${e.uses} | ${e.roles?.text ?? ''} | ${e.roles?.bg ?? ''} | ${e.roles?.border ?? ''} | ${tok(e)} |`);
    lines.push('');
  }
  const list = (title, k) => {
    const entries = style[k] || [];
    if (!entries.length) return;
    lines.push(`## ${title}`, '');
    for (const e of entries) lines.push(`- \`${fmtValue(k, e.value)}\` × ${e.uses}${tok(e) ? ` · ${tok(e)}` : ''}`);
    lines.push('');
  };
  list('Font sizes', 'fontSize');
  list('Fonts', 'fontFamily');
  list('Font weights', 'fontWeight');
  list('Corner radii', 'radius');
  list('Spacing (padding and gaps)', 'spacing');
  list('Shadows', 'shadow');
  list('Durations', 'duration');
  list('Easings', 'easing');
  lines.push(`## Near-duplicates (${style.drift.length})`, '');
  if (!style.drift.length) lines.push('None: every rarely used value is clearly different from the common ones.', '');
  for (const d of style.drift) {
    const where = d.examples[0] ? ` e.g. \`${d.examples[0].sel}\` (${d.examples[0].route} ${d.examples[0].cell})` : '';
    const dist = d.kind === 'color' ? `ΔE ${d.distance}` : `${d.distance}px apart`;
    lines.push(`- ${d.kind}${d.scheme ? ` · ${d.scheme}` : ''}: \`${fmtValue(d.kind, d.value)}\` × ${d.uses}${where} ≈ \`${fmtValue(d.kind, d.near)}\`${d.nearTokens.length ? ` (\`${d.nearTokens[0]}\`)` : ''} × ${d.nearUses}, ${dist}`);
  }
  lines.push('', '## How Mantis uses this', '');
  lines.push(`\`mantis look\` reads \`style.json\` from its output directory (or \`--style <file>\`) and warns (\`off-style\`) when a page uses a color within ΔE ${LOOK_NEAR.color} of a house color without being one, a font size within ${LOOK_NEAR.fontSize}px or a radius within ${LOOK_NEAR.radius}px of the house values without being one, or a font the app uses nowhere else.`);
  if (style.notes.length) lines.push('', ...style.notes.map((n) => `- ${n}`));
  return lines.join('\n') + '\n';
}
