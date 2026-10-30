/**
 * console (error): uncaught exceptions (`pageerror`) and console.error() calls during the visit.
 * Chromium's own "Failed to load resource" console messages are skipped: those are network
 * failures and are reported once by request-failed / broken-image instead. So are errors about
 * service workers: Mantis blocks them (see contextOptions), so registering one fails because of
 * Mantis, not the page; the cell gets a note instead. In pseudo-locale cells, hydration mismatches
 * are skipped the same way: Mantis rewrote the server-rendered text before the framework hydrated.
 */
import { isPseudoLocale } from '../options.js';

const SERVICE_WORKER = /service ?worker|registerSW/i;
// React (#418/#423/#425 and their messages), Vue and Svelte hydration mismatch errors.
const HYDRATION = /hydrat|does not match server-rendered|server rendered html didn.?t match|Minified React error #(418|423|425)\b/i;

function shortLocation(url, line, column, origin) {
  if (!url) return '';
  let shown = url;
  try {
    const u = new URL(url);
    if (u.origin === origin) shown = u.pathname + u.search;
  } catch {
    // keep
  }
  return `${shown}${line ? `:${line}` : ''}${column ? `:${column}` : ''}`;
}

export default {
  name: 'console',
  phase: 'final',
  async run(page, ctx) {
    const origin = new URL(ctx.url).origin;
    const issues = [];
    let serviceWorker = 0;
    let hydration = 0;
    const pseudo = isPseudoLocale(ctx.cell?.locale);
    const ourHydration = (text) => {
      if (!pseudo || !HYDRATION.test(text)) return false;
      hydration++;
      return true;
    };
    const counts = new Map();
    const push = (key, issue) => {
      if (counts.has(key)) {
        counts.get(key).evidence.count++;
        return;
      }
      issue.evidence.count = 1;
      counts.set(key, issue);
      issues.push(issue);
    };
    for (const e of ctx.console.pageErrors) {
      if (SERVICE_WORKER.test(e.message) || SERVICE_WORKER.test(String(e.stack || ''))) {
        serviceWorker++;
        continue;
      }
      if (ourHydration(`${e.message}\n${e.stack || ''}`)) continue;
      const frame = String(e.stack || '').split('\n').find((l) => /\bat\b.*:\d+:\d+/.test(l)) || '';
      const m = frame.match(/(https?:\/\/[^\s)]+?):(\d+):(\d+)/);
      const where = m ? shortLocation(m[1], m[2], m[3], origin) : '';
      push(`pageerror:${e.message}`, {
        type: 'console',
        severity: 'error',
        key: `pageerror:${e.message}`,
        selector: null,
        rect: null,
        message: `Uncaught ${e.name || 'Error'}: ${e.message}${where ? ` (at ${where})` : ''}`,
        evidence: { kind: 'pageerror', name: e.name || 'Error', location: where || null, stack: String(e.stack || '').split('\n').slice(0, 4).join('\n') },
      });
    }
    for (const msg of ctx.console.errors) {
      if (/^Failed to load resource\b/.test(msg.text)) continue;
      if (SERVICE_WORKER.test(msg.text)) {
        serviceWorker++;
        continue;
      }
      if (ourHydration(msg.text)) continue;
      const where = shortLocation(msg.location?.url, msg.location?.lineNumber, msg.location?.columnNumber, origin);
      const text = msg.text.length > 300 ? msg.text.slice(0, 299) + '…' : msg.text;
      push(`console:${text}`, {
        type: 'console',
        severity: 'error',
        key: `console:${text}`,
        selector: null,
        rect: null,
        message: `console.error: ${text}${where ? ` (at ${where})` : ''}`,
        evidence: { kind: 'console.error', location: where || null },
      });
    }
    if (serviceWorker && ctx.cellInfo?.notes) {
      ctx.cellInfo.notes.push(`${serviceWorker} console error${serviceWorker === 1 ? '' : 's'} about service workers not reported: Mantis blocks service workers, so registering one fails.`);
    }
    if (hydration && ctx.cellInfo?.notes) {
      ctx.cellInfo.notes.push(`${hydration} hydration mismatch error${hydration === 1 ? '' : 's'} not reported: in the pseudo-locale Mantis rewrites the server-rendered text before the app hydrates.`);
    }
    return issues;
  },
};
