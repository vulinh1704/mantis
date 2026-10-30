/**
 * Third parties by host: a small map of common vendors to their name and category, so findings can
 * say "Intercom (chat)" instead of a domain, and suggest the fix that suits the kind of script.
 * Unknown hosts are grouped by site (registrable domain).
 */
import { siteOf } from './metrics.js';

/** Host suffix → [vendor, category]. The longest matching suffix wins. */
const VENDORS = {
  'googletagmanager.com': ['Google Tag Manager', 'tag-manager'],
  'google-analytics.com': ['Google Analytics', 'analytics'],
  'analytics.google.com': ['Google Analytics', 'analytics'],
  'doubleclick.net': ['Google Ads', 'ads'],
  'googlesyndication.com': ['Google Ads', 'ads'],
  'googleadservices.com': ['Google Ads', 'ads'],
  'fonts.googleapis.com': ['Google Fonts', 'fonts'],
  'fonts.gstatic.com': ['Google Fonts', 'fonts'],
  'maps.googleapis.com': ['Google Maps', 'maps'],
  'maps.gstatic.com': ['Google Maps', 'maps'],
  'recaptcha.net': ['reCAPTCHA', 'captcha'],
  'www.google.com': ['Google', 'other'],
  'facebook.net': ['Meta Pixel', 'ads'],
  'facebook.com': ['Meta', 'ads'],
  'tiktok.com': ['TikTok Pixel', 'ads'],
  'licdn.com': ['LinkedIn Insight', 'ads'],
  'ads-twitter.com': ['X Ads', 'ads'],
  'hotjar.com': ['Hotjar', 'analytics'],
  'hotjar.io': ['Hotjar', 'analytics'],
  'clarity.ms': ['Microsoft Clarity', 'analytics'],
  'segment.com': ['Segment', 'analytics'],
  'segment.io': ['Segment', 'analytics'],
  'mixpanel.com': ['Mixpanel', 'analytics'],
  'amplitude.com': ['Amplitude', 'analytics'],
  'posthog.com': ['PostHog', 'analytics'],
  'plausible.io': ['Plausible', 'analytics'],
  'simpleanalyticscdn.com': ['Simple Analytics', 'analytics'],
  'umami.is': ['Umami', 'analytics'],
  'fullstory.com': ['FullStory', 'analytics'],
  'heap.io': ['Heap', 'analytics'],
  'heapanalytics.com': ['Heap', 'analytics'],
  'cloudflareinsights.com': ['Cloudflare Web Analytics', 'analytics'],
  'intercom.io': ['Intercom', 'chat'],
  'intercomcdn.com': ['Intercom', 'chat'],
  'crisp.chat': ['Crisp', 'chat'],
  'drift.com': ['Drift', 'chat'],
  'driftt.com': ['Drift', 'chat'],
  'hs-scripts.com': ['HubSpot', 'chat'],
  'hs-analytics.net': ['HubSpot', 'analytics'],
  'hubspot.com': ['HubSpot', 'chat'],
  'zdassets.com': ['Zendesk', 'chat'],
  'zendesk.com': ['Zendesk', 'chat'],
  'tawk.to': ['tawk.to', 'chat'],
  'livechatinc.com': ['LiveChat', 'chat'],
  'youtube.com': ['YouTube', 'video'],
  'youtube-nocookie.com': ['YouTube', 'video'],
  'ytimg.com': ['YouTube', 'video'],
  'vimeo.com': ['Vimeo', 'video'],
  'vimeocdn.com': ['Vimeo', 'video'],
  'stripe.com': ['Stripe', 'payments'],
  'paypal.com': ['PayPal', 'payments'],
  'sentry.io': ['Sentry', 'monitoring'],
  'sentry-cdn.com': ['Sentry', 'monitoring'],
  'nr-data.net': ['New Relic', 'monitoring'],
  'newrelic.com': ['New Relic', 'monitoring'],
  'datadoghq.com': ['Datadog', 'monitoring'],
  'browser-intake-datadoghq.com': ['Datadog', 'monitoring'],
  'cookielaw.org': ['OneTrust', 'consent'],
  'onetrust.com': ['OneTrust', 'consent'],
  'cookiebot.com': ['Cookiebot', 'consent'],
  'cdn.jsdelivr.net': ['jsDelivr', 'cdn'],
  'unpkg.com': ['unpkg', 'cdn'],
  'cdnjs.cloudflare.com': ['cdnjs', 'cdn'],
};

/** The vendor a URL belongs to: `{ id, name, category }`, with the site as id and name when unknown. */
export function vendorOf(url) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return { id: url, name: url, category: 'other' };
  }
  let best = null;
  for (const suffix of Object.keys(VENDORS)) {
    if ((host === suffix || host.endsWith(`.${suffix}`)) && (!best || suffix.length > best.length)) best = suffix;
  }
  if (best) {
    const [name, category] = VENDORS[best];
    return { id: name, name, category };
  }
  const site = siteOf(url);
  return { id: site, name: site, category: 'other' };
}

/** How to keep a vendor off the critical path, by category. */
export const VENDOR_FIX = {
  chat: 'Load the chat on demand: show a lightweight button (a facade) and load the widget when it is clicked or the page is idle.',
  video: 'Use a facade: a thumbnail with a play button that swaps in the player on click (lite-youtube-embed, lite-vimeo-embed).',
  maps: 'Show a static map image and load the interactive map on click or when it scrolls into view.',
  analytics: 'Load it with `async`/`defer` after the page is interactive, or move it off the main thread (Partytown) or to the server.',
  'tag-manager': 'Load the tag manager after the page is interactive and audit its tags: each one runs on every visit.',
  ads: 'Load ad slots lazily, after the main content and out of the first screen.',
  fonts: 'Self-host the font files (fewer origins, no extra connection) with `font-display: swap`.',
  consent: 'Load the consent banner `async` and keep its layout reserved, so it neither blocks rendering nor shifts the page.',
  payments: 'Load the payment script only on the pages that take payments, or when the checkout opens.',
  monitoring: 'Load it `async` with a small loader, and sample the sessions it records.',
  captcha: 'Load the captcha when the form gets focus, not with the page.',
  cdn: 'Self-host the library with your bundle: one origin fewer, and it is cached with your app.',
  other: 'Load it with `async` or `defer`, or after the page is interactive (on idle or on interaction).',
};
