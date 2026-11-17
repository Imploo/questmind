import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { captureException } from './utils/sentry-error-handler';
import { PODCAST_SHARES_COLLECTION, PodcastShare } from './create-podcast-share';
import { escapeHtml, injectMetaTags, loadIndexHtml, meta, resolveOrigin } from './utils/share-page';
import { type Language, languageFromAcceptLanguage, parseLanguage } from './utils/language';

const SHARE_ID_PATTERN = /^[\w-]{16,64}$/;
/** Large link-preview image (source: public/og/podcast-share.svg). */
const OG_IMAGE_PATH = '/og/podcast-share.png';

/**
 * Serves `/share/podcast/:shareId` (via a Hosting rewrite) with Open Graph tags
 * for the shared podcast, so WhatsApp, Slack etc. show a link preview. Browsers
 * get the normal Angular app with those tags injected into the head.
 */
export const podcastSharePage = onRequest(
  { memory: '256MiB', timeoutSeconds: 30, concurrency: 80 },
  async (req, res) => {
    const origin = resolveOrigin(req.get('x-forwarded-host') ?? req.hostname);
    const shareId = req.path.split('/').filter(Boolean).pop() ?? '';

    let share: PodcastShare | null = null;
    if (SHARE_ID_PATTERN.test(shareId)) {
      try {
        const snap = await getFirestore().collection(PODCAST_SHARES_COLLECTION).doc(shareId).get();
        share = snap.exists ? (snap.data() as PodcastShare) : null;
      } catch (error) {
        captureException(error as Error, { function: 'podcastSharePage', shareId });
      }
    }

    const metaTags = share
      ? buildMetaTags(share, `${origin}/share/podcast/${shareId}`, `${origin}${OG_IMAGE_PATH}`)
      : '';
    const indexHtml = await loadIndexHtml('podcastSharePage');

    res.set('Cache-Control', 'public, max-age=0, s-maxage=300');
    res.status(share ? 200 : 404);
    if (indexHtml) {
      res.send(injectMetaTags(indexHtml, metaTags, share?.title));
    } else {
      // This page differs per visitor language, so a shared cache must keep them apart.
      res.set('Vary', 'Accept-Language');
      res.send(renderFallbackPage(metaTags, share, languageFromAcceptLanguage(req.get('accept-language'))));
    }
  }
);

/** The sentence under the title of the link preview. */
const PREVIEW_CALL_TO_ACTION: Record<Language, string> = {
  nl: 'luister naar de podcast',
  en: 'listen to the podcast',
};

/** Texts of the page that is served when the app shell cannot be fetched. */
const FALLBACK_PAGE_TEXTS: Record<Language, { notFoundTitle: string; notFoundText: string }> = {
  nl: { notFoundTitle: 'Podcast niet gevonden', notFoundText: 'Deze link bestaat niet (meer).' },
  en: { notFoundTitle: 'Podcast not found', notFoundText: 'This link does not exist (any more).' },
};

/**
 * The link preview is read by people we know nothing about, so it is written in the
 * language of whoever shared the podcast; a share from before that was stored is Dutch.
 */
export function buildMetaTags(share: PodcastShare, pageUrl: string, imageUrl: string): string {
  const description = `🎙️ ${share.subtitle} — ${PREVIEW_CALL_TO_ACTION[parseLanguage(share.language)]}`;
  return [
    meta('name', 'description', description),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'QuestMind'),
    meta('property', 'og:title', share.title),
    meta('property', 'og:description', description),
    meta('property', 'og:url', pageUrl),
    meta('property', 'og:image', imageUrl),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', 'QuestMind podcast'),
    meta('property', 'og:audio', share.audioUrl),
    meta('property', 'og:audio:type', 'audio/mpeg'),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', share.title),
    meta('name', 'twitter:description', description),
    meta('name', 'twitter:image', imageUrl),
  ].join('\n  ');
}

/** The page itself follows the visitor's language (`Accept-Language`), unlike the link preview. */
function renderFallbackPage(metaTags: string, share: PodcastShare | null, language: Language): string {
  const texts = FALLBACK_PAGE_TEXTS[language];
  const body = share
    ? `<h1>${escapeHtml(share.title)}</h1><p>${escapeHtml(share.subtitle)}</p>` +
      `<audio controls preload="metadata" src="${escapeHtml(share.audioUrl)}" style="width:100%"></audio>`
    : `<h1>${escapeHtml(texts.notFoundTitle)}</h1><p>${escapeHtml(texts.notFoundText)}</p>`;
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(share ? `${share.title} · QuestMind` : 'QuestMind')}</title>
  ${metaTags}
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem">${body}</body>
</html>`;
}
