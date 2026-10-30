/**
 * Detector registry.
 *
 * Per-cell detector:   { name, phase: 'load'|'dom'|'final', setup?(page, ctx), applies?(ctx), run(page, ctx) }
 *   - 'load'  runs right after the page settled, before Mantis scrolls through it (layout-shift);
 *   - 'dom'   runs after the pre-scroll pass, with lazy content loaded and animations finished;
 *   - 'final' runs last and turns events collected during the visit into issues (console, network).
 *   run() resolves to raw issues: { type, severity, selector, rect, message, evidence, key? }
 *   with `rect` in document coordinates (or null when there is nothing to outline).
 * Cross-cell detector: { name, cross: true, collect(page, ctx), compare(lightSnap, darkSnap), resolve(darkPage, findings) }
 *   runs once both the light and the dark cell of a route + viewport + locale were collected.
 */
import brokenImage from './broken-image.js';
import clippedText from './clipped-text.js';
import consoleErrors from './console.js';
import contrast from './contrast.js';
import direction from './direction.js';
import layoutShift from './layout-shift.js';
import offStyle from './off-style.js';
import overlap from './overlap.js';
import pageOverflow from './page-overflow.js';
import requestFailed from './request-failed.js';
import tapTarget from './tap-target.js';
import themeLeak from './theme-leak.js';

export const CELL_DETECTORS = [
  layoutShift,
  pageOverflow,
  clippedText,
  direction,
  overlap,
  contrast,
  tapTarget,
  brokenImage,
  consoleErrors,
  requestFailed,
  offStyle,
];

export const CROSS_DETECTORS = [themeLeak];

/** Every issue type Mantis can emit, in report order. `cover-up` and `lost` come from compare.js. */
export const ISSUE_TYPES = [
  'cover-up',
  'page-overflow',
  'clipped-text',
  'direction',
  'overlap',
  'contrast',
  'theme-leak',
  'console',
  'broken-image',
  'request-failed',
  'tap-target',
  'layout-shift',
  'off-style',
  'lost',
];
