/**
 * direction (error): a right-to-left language laid out left to right. When the cell's language is
 * written right to left (Arabic, Hebrew, Persian, Urdu…) and most of the page's letters really are
 * in that script, but the page still runs left to right (no `dir="rtl"` on `<html>` or the body),
 * text sits on the wrong side, punctuation lands at the wrong end and nothing is mirrored.
 *
 * Not reported: pages in that language that are mostly Latin text (untranslated or partly
 * translated), and the pseudo-locales, which set the direction themselves.
 */
const RTL_LANGUAGES = new Set(['ar', 'he', 'iw', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv', 'ckb', 'syr']);

export default {
  name: 'direction',
  phase: 'dom',
  applies: (ctx) => RTL_LANGUAGES.has(String(ctx.cell.browserLocale ?? ctx.cell.locale).split('-')[0].toLowerCase()) &&
    !String(ctx.cell.locale).startsWith('pseudo'),
  async run(page, ctx) {
    const d = await page.evaluate(() => {
      const text = document.body ? document.body.innerText || '' : '';
      return {
        direction: getComputedStyle(document.body || document.documentElement).direction,
        htmlDir: document.documentElement.getAttribute('dir'),
        htmlLang: document.documentElement.getAttribute('lang'),
        rtlLetters: (text.match(/[֐-ࣿיִ-﷿ﹰ-﻿]/g) || []).length,
        latinLetters: (text.match(/[A-Za-z]/g) || []).length,
      };
    });
    if (d.direction === 'rtl' || d.rtlLetters < 20 || d.rtlLetters <= d.latinLetters) return [];
    const lang = String(ctx.cell.browserLocale ?? ctx.cell.locale);
    return [{
      type: 'direction',
      severity: 'error',
      selector: 'html',
      rect: null,
      message: `The page is in a right-to-left language (${lang}: ${d.rtlLetters} right-to-left letters) but lays out left to right: ` +
        `\`<html>\` has ${d.htmlDir ? `dir="${d.htmlDir}"` : 'no dir attribute'}. Set dir="rtl" for ${lang} so text, punctuation and layout are mirrored.`,
      evidence: d,
    }];
  },
};
