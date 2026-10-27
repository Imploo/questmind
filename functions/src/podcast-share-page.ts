import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { captureException } from './utils/sentry-error-handler';
import { PODCAST_SHARES_COLLECTION, PodcastShare } from './create-podcast-share';

const SHARE_ID_PATTERN = /^[\w-]{16,64}$/;
/** Hosts the page may be served under — used for absolute og:url/og:image links. */
const ALLOWED_HOST_PATTERN = /^(questmind\.nl|[\w-]+\.web\.app|[\w-]+\.firebaseapp\.com)$/;
/** The SPA shell changes per deploy (hashed bundles), so it is only cached briefly. */
const INDEX_CACHE_MS = 60 * 1000;
/** Large link-preview image (source: public/og/podcast-share.svg). */
const OG_IMAGE_PATH = '/og/podcast-share.png';

let indexCache: { html: string; fetchedAt: number } | null = null;

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
    const indexHtml = await loadIndexHtml();

    res.set('Cache-Control', 'public, max-age=0, s-maxage=300');
    res.status(share ? 200 : 404);
    if (indexHtml) {
      res.send(injectMetaTags(indexHtml, metaTags, share?.title));
    } else {
      res.send(renderFallbackPage(metaTags, share));
    }
  }
);

export function buildMetaTags(share: PodcastShare, pageUrl: string, imageUrl: string): string {
  const description = `🎙️ ${share.subtitle} — luister naar de podcast`;
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

/** Replace the default title/description of the SPA shell and add the share tags. */
export function injectMetaTags(indexHtml: string, metaTags: string, title?: string): string {
  if (!metaTags) return indexHtml;
  // Function replacers: a `$` in a title must not be read as a replacement pattern.
  return indexHtml
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(`${title} · QuestMind`)}</title>`)
    .replace(/\s*<meta name="description"[^>]*>/, '')
    .replace('</head>', () => `  ${metaTags}\n</head>`);
}

function renderFallbackPage(metaTags: string, share: PodcastShare | null): string {
  const body = share
    ? `<h1>${escapeHtml(share.title)}</h1><p>${escapeHtml(share.subtitle)}</p>` +
      `<audio controls preload="metadata" src="${escapeHtml(share.audioUrl)}" style="width:100%"></audio>`
    : '<h1>Podcast niet gevonden</h1><p>Deze link bestaat niet (meer).</p>';
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(share ? `${share.title} · QuestMind` : 'QuestMind')}</title>
  ${metaTags}
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem">${body}</body>
</html>`;
}

/**
 * The built index.html, fetched from the project's own Hosting site (never from
 * the request's host, so a forged header can't point the fetch elsewhere).
 */
async function loadIndexHtml(): Promise<string | null> {
  if (indexCache && Date.now() - indexCache.fetchedAt < INDEX_CACHE_MS) {
    return indexCache.html;
  }
  const projectId = process.env.GCLOUD_PROJECT;
  if (!projectId) return null;
  try {
    const response = await fetch(`https://${projectId}.web.app/index.html`);
    if (!response.ok) throw new Error(`index.html fetch failed: HTTP ${response.status}`);
    indexCache = { html: await response.text(), fetchedAt: Date.now() };
    return indexCache.html;
  } catch (error) {
    captureException(error as Error, { function: 'podcastSharePage' });
    return indexCache?.html ?? null;
  }
}

function resolveOrigin(host: string): string {
  const hostname = host.split(',')[0].trim().toLowerCase();
  if (ALLOWED_HOST_PATTERN.test(hostname)) {
    return `https://${hostname}`;
  }
  return `https://${process.env.GCLOUD_PROJECT}.web.app`;
}

function meta(attribute: 'name' | 'property', key: string, content: string): string {
  return `<meta ${attribute}="${key}" content="${escapeHtml(content)}">`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
