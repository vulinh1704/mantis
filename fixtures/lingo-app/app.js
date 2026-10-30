// Lingo picks its language the way many real apps do: a /de/ path prefix, ?lang=, a `lang` cookie
// or localStorage `lingo-lang`. It ignores the browser language on purpose, so Accept-Language alone
// never switches it. Planted bug: the German call to action is cut off by a fixed-width button.
const STRINGS = {
  en: { title: 'Lingo', lead: 'Practice a language every day.', cta: 'Start free' },
  de: { title: 'Lingo', lead: 'Übe jeden Tag eine Sprache.', cta: 'Jetzt kostenlos registrieren' },
};

function pick() {
  const segment = location.pathname.split('/')[1];
  const query = new URLSearchParams(location.search).get('lang');
  const cookie = document.cookie.match(/(?:^|; )lang=([^;]+)/)?.[1];
  let stored = null;
  try {
    stored = localStorage.getItem('lingo-lang');
  } catch {
    // storage disabled
  }
  for (const l of [segment, query, cookie, stored]) if (l && STRINGS[l]) return l;
  return 'en';
}

const lang = pick();
document.documentElement.lang = lang;
for (const [id, text] of Object.entries(STRINGS[lang])) document.getElementById(id).textContent = text;
