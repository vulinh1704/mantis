/**
 * direction (error): a right-to-left language laid out left to right. When the cell's language is
 * written right to left (Arabic, Hebrew, Persian, Urdu…), most of the page's letters really are in
 * that script, and most of that text sits in a left-to-right context (no `dir="rtl"` on it or any
 * ancestor), then text aligns to the wrong side, punctuation lands at the wrong end and nothing is
 * mirrored. The direction is read where the text is, so an app that sets `dir="rtl"` on a wrapper
 * (`<div id="root" dir="rtl">`, a component library's direction provider) is fine.
 *
 * Not reported: pages in that language that are mostly Latin text (untranslated or partly
 * translated), and the pseudo-locales, which set the direction themselves.
 */
import { isPseudoLocale } from '../options.js';

const RTL_LANGUAGES = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv', 'ckb', 'syr']);

export default {
  name: 'direction',
  phase: 'dom',
  applies: (ctx) => !isPseudoLocale(ctx.cell.locale) &&
    RTL_LANGUAGES.has(String(ctx.cell.browserLocale ?? ctx.cell.locale).split('-')[0].toLowerCase()),
  async run(page, ctx) {
    const d = await page.evaluate(() => {
      const RTL = /[֐-ࣿיִ-﷿ﹰ-﻿]/g;
      let rtlLetters = 0;
      let latinLetters = 0;
      let inRtl = 0; // right-to-left letters whose element is laid out right to left
      const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
      for (let t = walker.nextNode(), seen = 0; t && seen < 5000; t = walker.nextNode(), seen++) {
        const el = t.parentElement;
        if (!el || el.closest('script, style, noscript, template')) continue;
        const r = (t.data.match(RTL) || []).length;
        latinLetters += (t.data.match(/[A-Za-z]/g) || []).length;
        if (!r) continue;
        rtlLetters += r;
        if (getComputedStyle(el).direction === 'rtl') inRtl += r;
      }
      return {
        htmlDir: document.documentElement.getAttribute('dir'),
        htmlLang: document.documentElement.getAttribute('lang'),
        rtlLetters,
        latinLetters,
        rtlLettersInRtlContext: inRtl,
      };
    });
    if (d.rtlLetters < 20 || d.rtlLetters <= d.latinLetters || d.rtlLettersInRtlContext >= d.rtlLetters / 2) return [];
    const lang = String(ctx.cell.browserLocale ?? ctx.cell.locale);
    const share = Math.round((1 - d.rtlLettersInRtlContext / d.rtlLetters) * 100);
    return [{
      type: 'direction',
      severity: 'error',
      selector: 'html',
      rect: null,
      message: `The page is in a right-to-left language (${lang}) but ${share}% of its ${d.rtlLetters} right-to-left letters are laid out left to right ` +
        `(\`<html>\` has ${d.htmlDir ? `dir="${d.htmlDir}"` : 'no dir attribute'}). Set dir="rtl" for ${lang}, on <html> or the app's root, so text, punctuation and layout are mirrored.`,
      evidence: d,
    }];
  },
};
