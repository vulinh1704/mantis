// A pricing page in English and Arabic (?lang=ar). Planted: a row of three fixed-width plan cards
// that doesn't fit a phone, so it overflows past the end edge: the right in English, the left in
// Arabic. index.html sets dir="rtl" for Arabic; broken.html forgets to (window.SET_DIR = false).
const STRINGS = {
  en: { title: 'Pricing', lead: 'Pick the plan that fits your team and start today.', plans: ['Basic', 'Pro', 'Business'] },
  ar: { title: 'خطط الأسعار', lead: 'اختر الخطة المناسبة لفريقك وابدأ اليوم.', plans: ['أساسي', 'احترافي', 'مؤسسات'] },
};
const lang = new URLSearchParams(location.search).get('lang') === 'ar' ? 'ar' : 'en';
const s = STRINGS[lang];
document.documentElement.lang = lang;
if (window.SET_DIR !== false) document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
document.getElementById('title').textContent = s.title;
document.getElementById('lead').textContent = s.lead;
document.getElementById('plans').innerHTML = s.plans.map((p) => `<div class="plan">${p}</div>`).join('');
