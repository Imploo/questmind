import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { captureException } from './utils/sentry-error-handler';
import { escapeHtml, excerpt, injectMetaTags, loadIndexHtml, meta, resolveOrigin } from './utils/share-page';
import { type Language, languageFromAcceptLanguage, parseLanguage } from './utils/language';
import { loadCampaignShare, loadSharedCampaign } from './campaign-share/load-shared-campaign';
import { SharedCampaign } from './campaign-share/campaign-share.types';

/** Large link-preview image (source: public/og/campaign-share.svg). */
const OG_IMAGE_PATH = '/og/campaign-share.png';
const STORY_MAX_LENGTH = 180;

interface CampaignPreview {
  title: string;
  description: string;
}

/**
 * Serves `/share/campaign/:shareId` (and the addresses below it, via a Hosting
 * rewrite) with Open Graph tags for the campaign, so WhatsApp, Slack etc. show a
 * link preview: the campaign's name, its facts and the start of its story.
 * Browsers get the normal Angular app, which shows the campaign read-only.
 */
export const campaignSharePage = onRequest(
  { memory: '256MiB', timeoutSeconds: 30, concurrency: 80 },
  async (req, res) => {
    const origin = resolveOrigin(req.get('x-forwarded-host') ?? req.hostname);
    // ['share', 'campaign', shareId, ...the part of the campaign]
    const [, , shareId = ''] = req.path.split('/').filter(Boolean);

    let preview: CampaignPreview | null = null;
    try {
      const db = getFirestore();
      const share = await loadCampaignShare(db, shareId);
      const campaign = share ? await loadSharedCampaign(db, share.campaignId) : null;
      // Written in the language of whoever shared it: we know nothing about who reads it.
      preview = campaign && share ? describeCampaign(campaign, parseLanguage(share.language)) : null;
    } catch (error) {
      captureException(error as Error, { function: 'campaignSharePage', shareId });
    }

    const pageUrl = `${origin}/share/campaign/${shareId}`;
    const metaTags = preview ? buildCampaignMetaTags(preview, pageUrl, `${origin}${OG_IMAGE_PATH}`) : '';
    const indexHtml = await loadIndexHtml('campaignSharePage');

    res.set('Cache-Control', 'public, max-age=0, s-maxage=300');
    res.status(preview ? 200 : 404);
    if (indexHtml) {
      res.send(injectMetaTags(indexHtml, metaTags, preview?.title));
    } else {
      // This page differs per visitor language, so a shared cache must keep them apart.
      res.set('Vary', 'Accept-Language');
      res.send(renderFallbackPage(metaTags, preview, languageFromAcceptLanguage(req.get('accept-language'))));
    }
  }
);

/** Texts of the link preview, in the sharer's language. */
const PREVIEW_TEXTS: Record<Language, {
  locale: string;
  sessions: (count: number) => string;
  players: (count: number) => string;
  lastPlayed: (day: string) => string;
  noStory: string;
}> = {
  nl: {
    locale: 'nl-NL',
    sessions: count => (count === 1 ? '1 sessie' : `${count} sessies`),
    players: count => (count === 1 ? '1 speler' : `${count} spelers`),
    lastPlayed: day => `laatst gespeeld op ${day}`,
    noStory: 'Lees de verslagen van de sessies en luister naar de podcasts.',
  },
  en: {
    locale: 'en-GB',
    sessions: count => (count === 1 ? '1 session' : `${count} sessions`),
    players: count => (count === 1 ? '1 player' : `${count} players`),
    lastPlayed: day => `last played on ${day}`,
    noStory: 'Read the stories of the sessions and listen to the podcasts.',
  },
};

/**
 * "📜 18 sessies · 7 spelers · laatst gespeeld op 20 okt 2026 — <start of the story>".
 * The story is the players' own text, so it stays as written.
 */
export function describeCampaign(campaign: SharedCampaign, language: Language): CampaignPreview {
  const texts = PREVIEW_TEXTS[language];
  const facts = [
    texts.sessions(campaign.sessionCount),
    campaign.playerCount > 0 ? texts.players(campaign.playerCount) : '',
    campaign.lastPlayed ? texts.lastPlayed(formatDay(campaign.lastPlayed, texts.locale)) : '',
  ].filter(Boolean).join(' · ');
  const story = campaign.story
    ? [campaign.story.title, excerpt(campaign.story.content, STORY_MAX_LENGTH)].filter(Boolean).join(': ')
    : texts.noStory;
  return { title: campaign.name, description: `📜 ${facts} — ${story}` };
}

/** A stored play day (`2026-10-20`) as "20 okt 2026"; anything else as it is. */
function formatDay(day: string, locale: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function buildCampaignMetaTags(preview: CampaignPreview, pageUrl: string, imageUrl: string): string {
  const { title, description } = preview;
  return [
    meta('name', 'description', description),
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'QuestMind'),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:url', pageUrl),
    meta('property', 'og:image', imageUrl),
    meta('property', 'og:image:width', '1200'),
    meta('property', 'og:image:height', '630'),
    meta('property', 'og:image:alt', `${title} — QuestMind campaign`),
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    meta('name', 'twitter:image', imageUrl),
  ].join('\n  ');
}

/** Texts of the page that is served when the app shell cannot be fetched. */
const FALLBACK_PAGE_TEXTS: Record<Language, { notFoundTitle: string; notFoundText: string }> = {
  nl: { notFoundTitle: 'Campagne niet gevonden', notFoundText: 'Deze link bestaat niet (meer).' },
  en: { notFoundTitle: 'Campaign not found', notFoundText: 'This link does not exist (any more).' },
};

/** The page itself follows the visitor's language (`Accept-Language`), unlike the link preview. */
function renderFallbackPage(metaTags: string, preview: CampaignPreview | null, language: Language): string {
  const texts = FALLBACK_PAGE_TEXTS[language];
  const body = preview
    ? `<h1>${escapeHtml(preview.title)}</h1><p>${escapeHtml(preview.description)}</p>`
    : `<h1>${escapeHtml(texts.notFoundTitle)}</h1><p>${escapeHtml(texts.notFoundText)}</p>`;
  return `<!doctype html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(preview ? `${preview.title} · QuestMind` : 'QuestMind')}</title>
  ${metaTags}
</head>
<body style="font-family:system-ui,sans-serif;max-width:36rem;margin:3rem auto;padding:0 1rem">${body}</body>
</html>`;
}
